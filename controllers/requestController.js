// requestController.js  -  "service subscribe karo" flow
//   matchProviders    resident "Find Providers" dabata hai -> match hone wale providers
//   createRequest     resident "Confirm" dabata hai        -> request save
//   respondToRequest  provider Accept / Reject             -> accept par schedule (subscriptions) ban jata hai
const { sequelize, User, ServiceRequest, Subscription } = require('../models');
const {
  SERVICE_LABEL, MILK_INFO, PAPER_LABEL,
  fixName, readJson, dateOnly, fullAddress, cleanGroups, checkRequirement,
} = require('../utils/helpers');
const { providerMatches, allotPlace } = require('../utils/matching');
const { buildBreakdown, describeGroup } = require('../utils/pricing');
const { findProviders, findProviderById, getAddress } = require('../utils/providerQuery');

// Provider "card" jo frontend dikhata hai (list + summary screen)
function makeProviderCard(provider, service, groups, distance, startDate) {
  const breakdown = buildBreakdown(provider, service, groups, startDate);

  const products = readJson(provider.milkProducts, []).map((p) => {
    const id = fixName(p.name);
    const info = MILK_INFO[id] || { label: p.name, unit: '' };
    return { id: id, label: info.label, unit: info.unit, price: Number(p.price) || 0 };
  });
  const newspapers = readJson(provider.newspaperTypes, []).map((id) => ({ id: id, label: PAPER_LABEL[id] || id }));

  return {
    id: provider.id,
    name: provider.name,
    email: provider.email,
    contact: provider.contact,
    gender: provider.gender,
    service: provider.service,
    serviceLabel: SERVICE_LABEL[provider.service],
    address: fullAddress(provider),
    area: provider.area,
    city: provider.city,
    distanceKm: distance == null ? null : Math.round(distance * 10) / 10,
    products: products,
    newspapers: newspapers,
    servicePrice: provider.servicePrice == null ? null : Number(provider.servicePrice),
    days: String(provider.days || '').split(',').filter(Boolean),
    timeSlots: readJson(provider.timeSlots, []),
    breakdown: breakdown,
    total: breakdown.total,
  };
}

// ------------------------------------------------------------
// POST /api/requests/match
// body: { residentId, service, radius, startDate, groups }
// Sirf EXACT match wale providers wapis aate hain (match nahi = khali list)
// ------------------------------------------------------------
async function matchProviders(req, res) {
  try {
    const { residentId, service, radius, startDate, groups: rawGroups } = req.body;
    const groups = cleanGroups(rawGroups);
    const problem = checkRequirement(service, groups);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const start = startDate || dateOnly(new Date());
    const residentAddress = residentId ? await getAddress(residentId) : null;
    const providers = await findProviders(service);

    const matches = [];
    for (const provider of providers) {
      const result = await providerMatches(provider, service, groups, Number(radius) || 0, residentAddress);
      if (result.ok) matches.push(makeProviderCard(provider, service, groups, result.distance, start));
    }

    // sab se qareeb pehle
    matches.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    res.json({ success: true, providers: matches });
  } catch (error) {
    console.log('matchProviders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// POST /api/requests
// body: { residentId, providerId, service, startDate, radius, notes, groups }
// ------------------------------------------------------------
async function createRequest(req, res) {
  try {
    const { residentId, providerId, service, startDate, radius, notes, groups: rawGroups } = req.body;
    const groups = cleanGroups(rawGroups);
    const problem = checkRequirement(service, groups);
    if (problem) return res.status(400).json({ success: false, message: problem });
    if (!residentId || !providerId || !startDate) {
      return res.status(400).json({ success: false, message: 'residentId, providerId and startDate are required' });
    }

    const resident = await User.findOne({ where: { id: residentId, role: 'resident' }, attributes: ['id', 'name'] });
    if (!resident) return res.status(404).json({ success: false, message: 'Resident not found' });

    const provider = await findProviderById(providerId);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });

    // provider ab bhi match karta hai? (data badal sakta hai)
    const residentAddress = await getAddress(residentId);
    const result = await providerMatches(provider, service, groups, Number(radius) || 0, residentAddress);
    if (!result.ok) {
      return res.status(409).json({ success: false, message: 'This provider no longer matches your requirement' });
    }

    // wohi pending request dobara na jaye
    const same = await ServiceRequest.findOne({
      where: { residentId, providerId, service, status: 'pending' },
      attributes: ['id'],
    });
    if (same) {
      return res.status(409).json({ success: false, message: 'You already sent this request to this provider (pending)' });
    }

    const card = makeProviderCard(provider, service, groups, result.distance, startDate);

    const saved = await ServiceRequest.create({
      residentId, providerId, service, startDate,
      radiusKm: Number(radius) || 2,
      notes: notes || null,
      groupsJson: groups,
      estimatedMonthly: card.total,
    });

    res.status(201).json({ success: true, message: 'Request sent to the provider', requestId: saved.id });
  } catch (error) {
    console.log('createRequest error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// POST /api/requests/:id/respond
// body: { providerId, action: 'accept' | 'reject' }
// ------------------------------------------------------------
async function respondToRequest(req, res) {
  try {
    const requestId = Number(req.params.id);
    const { providerId, action } = req.body;
    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ success: false, message: "action must be 'accept' or 'reject'" });
    }

    const request = await ServiceRequest.findByPk(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (Number(request.providerId) !== Number(providerId)) {
      return res.status(403).json({ success: false, message: 'This request is not for you' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'This request was already answered' });
    }

    // ACCEPT: har group ke liye ghante main khali 10-minute ki jagah dhoondo.
    // Ghante main 6 residents ho chuke hon to request accept NAHI ho sakti.
    const groups = readJson(request.groupsJson, []);
    const places = [];
    if (action === 'accept') {
      for (const g of groups) {
        const place = await allotPlace(request.providerId, g, requestId);
        if (!place.ok) return res.status(409).json({ success: false, message: place.reason });
        places.push(place.slotIndex);
      }
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';

    // Status + subscriptions aik transaction main.
    // Status tab hi badlta hai jab wo abhi bhi "pending" ho (do taps aik sath aayen to sirf pehla chalega).
    const done = await sequelize.transaction(async (t) => {
      const [affected] = await ServiceRequest.update(
        { status: newStatus, respondedAt: new Date() },
        { where: { id: requestId, status: 'pending' }, transaction: t }
      );
      if (affected === 0) return false;

      if (action === 'accept') {
        const provider = await findProviderById(providerId);
        const startDate = dateOnly(request.startDate);
        const breakdown = buildBreakdown(provider, request.service, groups, startDate);

        const rows = groups.map((g, i) => ({
          requestId: requestId,
          residentId: request.residentId,
          providerId: request.providerId,
          service: request.service,
          days: g.days.join(','),
          fromTime: g.from,
          toTime: g.to,
          details: describeGroup(request.service, g).slice(0, 250),
          startDate: startDate,
          monthlyRate: breakdown.groups[i].total,
          slotIndex: places[i],
        }));
        await Subscription.bulkCreate(rows, { transaction: t });
      }
      return true;
    });

    if (!done) {
      return res.status(409).json({ success: false, message: 'This request was already answered' });
    }
    res.json({ success: true, status: newStatus });
  } catch (error) {
    console.log('respondToRequest error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { matchProviders, createRequest, respondToRequest };
