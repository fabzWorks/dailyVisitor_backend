// matching.js  -  faisla karta hai ke provider resident ki requirement se match karta hai ya nahi
const { Op } = require('sequelize');
const { ServiceRequest, Subscription } = require('../models');
const { readJson, fixName, distanceKm, MILK_INFO, PAPER_LABEL } = require('./helpers');

// Aik provider check karo. Wapis: { ok: true, distance } ya { ok: false, reason }
function checkProvider(provider, service, groups, radiusKm, residentAddress) {
  // 1. same service?
  if (provider.service !== service) {
    return { ok: false, reason: 'different service (' + provider.service + ')' };
  }

  const providerDays = String(provider.days || '').split(',').filter(Boolean);
  const slots = readJson(provider.timeSlots, []);

  if (providerDays.length === 0) {
    return { ok: false, reason: 'provider has NO service days saved' };
  }

  // 2. items
  if (service === 'milkman') {
    const products = readJson(provider.milkProducts, []);
    const sells = products.map((p) => fixName(p.name));
    for (const g of groups) {
      for (const item of g.milkProducts) {
        if (!sells.includes(item)) {
          const name = (MILK_INFO[item] && MILK_INFO[item].label) || item;
          return { ok: false, reason: 'does not sell ' + name };
        }
      }
    }
  }
  if (service === 'newspaper') {
    const sells = readJson(provider.newspaperTypes, []);
    for (const g of groups) {
      for (const paper of g.papers) {
        if (!sells.includes(paper)) {
          return { ok: false, reason: 'does not sell newspaper ' + (PAPER_LABEL[paper] || paper) };
        }
      }
    }
  }
  if (service === 'garbage') {
    // "weight" = aik pickup main sab se ziada kg
    const maxKg = Number(provider.weight) || 0;
    if (maxKg > 0) {
      for (const g of groups) {
        if (g.garbageKg > maxKg) return { ok: false, reason: 'takes at most ' + maxKg + ' kg per pickup (you asked ' + g.garbageKg + ' kg)' };
      }
    }
  }

  // 3 + 4. din aur time (group by group)
  for (const g of groups) {
    for (const day of g.days) {
      if (!providerDays.includes(day)) {
        return { ok: false, reason: 'does not work on ' + day + ' (works on: ' + providerDays.join(',') + ')' };
      }
    }
    let timeFits = false;
    for (const slot of slots) {
      if (slot.from <= g.from && g.to <= slot.to) timeFits = true;
    }
    if (!timeFits) {
      const slotText = slots.map((s) => s.from + '-' + s.to).join(', ');
      return { ok: false, reason: 'time slot (' + slotText + ') does not cover ' + g.from + '-' + g.to };
    }
  }

  // 5. distance (radius 0 = koi limit nahi)
  let distance = null;
  const bothHaveLocation =
    residentAddress && residentAddress.latitude != null && provider.latitude != null;
  if (bothHaveLocation) {
    distance = distanceKm(
      Number(residentAddress.latitude), Number(residentAddress.longitude),
      Number(provider.latitude), Number(provider.longitude)
    );
    if (radiusKm && distance > radiusKm) {
      return { ok: false, reason: 'too far: ' + distance.toFixed(1) + ' km (your radius is ' + radiusKm + ' km)' };
    }
  }

  return { ok: true, distance: distance };
}

// "07:30" -> 450 (raat 12 se minutes)
function toMinutes(time) {
  const parts = time.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

// 6. CAPACITY  -  aik ghante main ziada se ziada 6 residents
const PLACES_PER_HOUR = 6;
const MINUTES_PER_PLACE = 10;

function overlaps(aFrom, aTo, bFrom, bTo) {
  return toMinutes(aFrom) < toMinutes(bTo) && toMinutes(bFrom) < toMinutes(aTo);
}

async function checkCapacity(provider, groups) {
  // provider ki pending + accepted requests ke saare groups
  const requests = await ServiceRequest.findAll({
    where: { providerId: provider.id, status: { [Op.in]: ['pending', 'accepted'] } },
    attributes: ['groupsJson'],
  });
  const oldGroups = [];
  for (const row of requests) {
    for (const g of readJson(row.groupsJson, [])) oldGroups.push(g);
  }

  for (const g of groups) {
    for (const day of g.days) {
      let booked = 0;
      for (const old of oldGroups) {
        if (old.days.includes(day) && overlaps(old.from, old.to, g.from, g.to)) booked = booked + 1;
      }
      if (booked >= PLACES_PER_HOUR) {
        return {
          full: true,
          reason: 'FULL on ' + day + ': ' + booked + ' of ' + PLACES_PER_HOUR + ' places taken at ' + g.from + '-' + g.to,
        };
      }
    }
  }
  return { full: false };
}

// Provider ACCEPT kare to ghante main agli khali 10-minute ki jagah deta hai.
// Wapis: { ok: true, slotIndex } (0 = pehle 10 min ... 5 = aakhri 10 min) ya { ok: false, reason }
async function allotPlace(providerId, group, exceptRequestId) {
  const subs = await Subscription.findAll({
    where: {
      providerId: providerId,
      status: { [Op.ne]: 'Completed' },
      requestId: { [Op.ne]: exceptRequestId },
    },
    attributes: ['days', 'fromTime', 'toTime', 'slotIndex'],
  });

  const used = new Set();
  for (const day of group.days) {
    let count = 0;
    for (const sub of subs) {
      if (sub.days.split(',').includes(day) && overlaps(sub.fromTime, sub.toTime, group.from, group.to)) {
        count = count + 1;
        if (sub.slotIndex != null) used.add(Number(sub.slotIndex));
      }
    }
    if (count >= PLACES_PER_HOUR) {
      return { ok: false, reason: 'This hour (' + group.from + '-' + group.to + ') is already full on ' + day + ' (' + PLACES_PER_HOUR + ' of ' + PLACES_PER_HOUR + ').' };
    }
  }

  for (let i = 0; i < PLACES_PER_HOUR; i++) {
    if (!used.has(i)) return { ok: true, slotIndex: i };
  }
  return { ok: false, reason: 'This hour (' + group.from + '-' + group.to + ') is already full.' };
}

async function providerMatches(provider, service, groups, radiusKm, residentAddress) {
  let result = checkProvider(provider, service, groups, radiusKm, residentAddress);

  if (result.ok) {
    const capacity = await checkCapacity(provider, groups);
    if (capacity.full) result = { ok: false, reason: capacity.reason };
  }

  if (result.ok) console.log('[match] SHOWN   -> ' + provider.name);
  else console.log('[match] SKIPPED -> ' + provider.name + ' : ' + result.reason);

  return result;
}

module.exports = { providerMatches, allotPlace, PLACES_PER_HOUR, MINUTES_PER_PLACE };
