// notificationController.js  -  notification bar
// Koi notification DB main save nahi hoti. List requests + deliveries se live banti hai
// aur har item hone ke 24 ghante baad gayab ho jata hai.
// (provider ki pending request jawab dene tak rehti hai)
const { Op } = require('sequelize');
const { User, Address, ServiceRequest, Subscription, Delivery } = require('../models');
const { SERVICE_LABEL, readJson, dateOnly, fullAddress } = require('../utils/helpers');
const { describeGroup } = require('../utils/pricing');

const DAY_MS = 24 * 60 * 60 * 1000;

// Request ke sath resident (address samet) aur provider
const REQUEST_INCLUDE = [
  {
    model: User, as: 'resident', attributes: ['id', 'name', 'contact'],
    include: [{ model: Address, as: 'address', attributes: ['address', 'area', 'city'] }],
  },
  { model: User, as: 'provider', attributes: ['id', 'name', 'contact'] },
];

// Subscription -> uski request (resident + provider samet)
function subscriptionInclude(whereColumn, userId) {
  return {
    model: Subscription, as: 'subscription', required: true,
    where: { [whereColumn]: userId },
    include: [{ model: ServiceRequest, as: 'request', required: true, include: REQUEST_INCLUDE }],
  };
}

function requestObject(r) {
  const groups = readJson(r.groupsJson, []).map((g) => ({
    days: g.days, from: g.from, to: g.to, details: describeGroup(r.service, g),
  }));
  return {
    id: r.id,
    status: r.status,
    service: r.service,
    serviceLabel: SERVICE_LABEL[r.service] || r.service,
    startDate: dateOnly(r.startDate),
    groups: groups,
    total: Number(r.estimatedMonthly) || 0,
    notes: r.notes,
    resident: {
      id: r.resident.id, name: r.resident.name, contact: r.resident.contact,
      address: fullAddress(r.resident.address),
    },
    provider: { id: r.provider.id, name: r.provider.name, contact: r.provider.contact },
  };
}

// ------------------------------------------------------------
// GET /api/notifications/:userId
// ------------------------------------------------------------
async function getNotifications(req, res) {
  try {
    const userId = Number(req.params.userId);
    const user = await User.findByPk(userId, { attributes: ['id', 'role'] });
    if (!user) return res.json({ success: true, notifications: [] });

    const since = new Date(Date.now() - DAY_MS);
    const list = [];

    if (user.role === 'provider') {
      // ---- naye requests (jawab dene tak, ya jawab ke 24 ghante tak) ----
      const requests = await ServiceRequest.findAll({
        where: {
          providerId: userId,
          [Op.or]: [{ status: 'pending' }, { respondedAt: { [Op.gte]: since } }],
        },
        include: REQUEST_INCLUDE,
      });
      for (const r of requests) {
        list.push({
          id: 'req-' + r.id, type: 'new_request', title: 'New Service Request',
          message: r.resident.name + ' wants ' + (SERVICE_LABEL[r.service] || r.service) + ' starting ' + dateOnly(r.startDate) + '.',
          createdAt: r.createdAt, request: requestObject(r), deliveryId: null, note: null,
        });
      }

      // ---- resident ke notes + skip kiye hue din ----
      const deliveries = await Delivery.findAll({
        where: {
          [Op.or]: [
            { residentNote: { [Op.ne]: null }, notedAt: { [Op.gte]: since } },
            { skippedAt: { [Op.gte]: since } },
          ],
        },
        include: [subscriptionInclude('providerId', userId)],
      });
      for (const d of deliveries) {
        const r = d.subscription.request;
        const label = SERVICE_LABEL[r.service] || r.service;
        if (d.residentNote && d.notedAt && d.notedAt >= since) {
          list.push({
            id: 'note-' + d.id, type: 'resident_note', title: 'Note from Resident',
            message: r.resident.name + ' sent a note for your ' + label + ' delivery.',
            createdAt: d.notedAt, request: requestObject(r), deliveryId: d.id, note: d.residentNote,
          });
        }
        if (d.skippedAt && d.skippedAt >= since) {
          list.push({
            id: 'skip-' + d.id, type: 'service_skipped', title: 'Service Skipped',
            message: r.resident.name + ' skipped your ' + label + ' service on ' + dateOnly(d.deliveryDate) + '.',
            createdAt: d.skippedAt, request: requestObject(r), deliveryId: d.id, note: null,
          });
        }
      }
    } else {
      // ---- resident: request accept / reject hui ----
      const requests = await ServiceRequest.findAll({
        where: {
          residentId: userId,
          status: { [Op.in]: ['accepted', 'rejected'] },
          respondedAt: { [Op.gte]: since },
        },
        include: REQUEST_INCLUDE,
      });
      for (const r of requests) {
        const accepted = r.status === 'accepted';
        const label = SERVICE_LABEL[r.service] || r.service;
        list.push({
          id: 'req-' + r.id, type: accepted ? 'request_accepted' : 'request_rejected',
          title: accepted ? 'Request Accepted' : 'Request Rejected',
          message: accepted
            ? r.provider.name + ' accepted your ' + label + ' request. Service starts ' + dateOnly(r.startDate) + '.'
            : r.provider.name + ' rejected your ' + label + ' request. Please choose another provider.',
          createdAt: r.respondedAt, request: requestObject(r), deliveryId: null, note: null,
        });
      }

      // ---- resident: provider pohancha / service ho gayi ----
      const deliveries = await Delivery.findAll({
        where: { [Op.or]: [{ arrivedAt: { [Op.gte]: since } }, { completedAt: { [Op.gte]: since } }] },
        include: [subscriptionInclude('residentId', userId)],
      });
      for (const d of deliveries) {
        const r = d.subscription.request;
        const label = SERVICE_LABEL[r.service] || r.service;
        if (d.arrivedAt && d.arrivedAt >= since) {
          list.push({
            id: 'arr-' + d.id, type: 'provider_arrived', title: 'Provider Arrived',
            message: r.provider.name + ' has arrived for your ' + label + '.',
            createdAt: d.arrivedAt, request: requestObject(r), deliveryId: d.id, note: d.residentNote || null,
          });
        }
        if (d.completedAt && d.completedAt >= since) {
          list.push({
            id: 'done-' + d.id, type: 'service_done', title: 'Service Done',
            message: r.provider.name + ' has completed your ' + label + ' service.',
            createdAt: d.completedAt, request: requestObject(r), deliveryId: d.id, note: null,
          });
        }
      }
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, notifications: list.slice(0, 100) });
  } catch (error) {
    console.log('getNotifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { getNotifications };
