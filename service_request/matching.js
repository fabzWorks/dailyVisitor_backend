
// matching.js  -  decides if a provider fits the resident's requirement

const db = require('../db');
const { readJson, fixName, distanceKm, MILK_INFO, PAPER_LABEL } = require('./helpers');

// Checks one provider. Returns { ok: true, distance } or { ok: false, reason }
function checkProvider(provider, service, groups, radiusKm, residentAddress) {
  // 1. same service?
  if (provider.service !== service) {
    return { ok: false, reason: 'different service (' + provider.service + ')' };
  }

  const providerDays = String(provider.days || '').split(',').filter(Boolean);  // "Mon,Tue" -> ['Mon','Tue']
  const slots = readJson(provider.time_slots, []);                              // [{from:'06:00', to:'09:00'}]

  // old accounts have no days saved
  if (providerDays.length === 0) {
    return { ok: false, reason: 'provider has NO service days saved (column "days" is empty) -> run the UPDATE for days' };
  }

  // 2. items
  if (service === 'milkman') {
    const products = readJson(provider.milk_products, []);
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
    const sells = readJson(provider.newspaper_types, []);
    for (const g of groups) {
      for (const paper of g.papers) {
        if (!sells.includes(paper)) {
          return { ok: false, reason: 'does not sell newspaper ' + (PAPER_LABEL[paper] || paper) };
        }
      }
    }
  }

  if (service === 'garbage') {
    // "weight" = the most garbage (kg) this collector takes in one pickup
    const maxKg = Number(provider.weight) || 0;
    if (maxKg > 0) {
      for (const g of groups) {
        if (g.garbageKg > maxKg) return { ok: false, reason: 'takes at most ' + maxKg + ' kg per pickup (you asked ' + g.garbageKg + ' kg)' };
      }
    }
  }

  // 3 + 4. days and time (checked group by group)
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

  // 5. distance  ->  radius rule is ON (radius 0 = no limit)
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

// "07:30" -> 450  (minutes since midnight)
function toMinutes(time) {
  const parts = time.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

// ------------------------------------------------------------
// 6. CAPACITY  -  max 6 residents in ONE HOUR

const PLACES_PER_HOUR = 6;
const MINUTES_PER_PLACE = 10;


function overlaps(aFrom, aTo, bFrom, bTo) {
  return toMinutes(aFrom) < toMinutes(bTo) && toMinutes(bFrom) < toMinutes(aTo);
}

async function checkCapacity(provider, groups) {
  // all groups of the requests this provider already has (pending + accepted)
  const [rows] = await db.query(
    "SELECT groups_json FROM service_requests WHERE provider_id = ? AND status IN ('pending', 'accepted')",
    [provider.id]
  );
  const oldGroups = [];
  for (const row of rows) {
    for (const g of readJson(row.groups_json, [])) oldGroups.push(g);
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

// Used when the provider ACCEPTS: gives the next free 10-minute place of that hour.
// Returns { ok: true, slotIndex } (0 = first 10 minutes ... 5 = last 10 minutes)
// or { ok: false, reason } when the hour is already full.
async function allotPlace(providerId, group, exceptRequestId) {
  const [subs] = await db.query(
    "SELECT days, from_time, to_time, slot_index FROM subscriptions WHERE provider_id = ? AND status <> 'Completed' AND request_id <> ?",
    [providerId, exceptRequestId]
  );

  const used = new Set();
  for (const day of group.days) {
    let count = 0;
    for (const sub of subs) {
      if (sub.days.split(',').includes(day) && overlaps(sub.from_time, sub.to_time, group.from, group.to)) {
        count = count + 1;
        if (sub.slot_index != null) used.add(Number(sub.slot_index));
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