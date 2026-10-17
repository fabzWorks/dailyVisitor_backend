// subscriptionController.js  -  schedule dekhna + provider ke "I am arrived" / "Service done"
const { User, Address, Subscription, Delivery } = require('../models');
const { SERVICE_LABEL, dateOnly, fullAddress } = require('../utils/helpers');
const { DATE_RE, getOrCreateDelivery } = require('../utils/deliveryHelpers');

const LOCATION_ATTRS = ['latitude', 'longitude', 'address', 'area', 'city'];
const num = (v) => (v == null ? null : Number(v));

// ------------------------------------------------------------
// GET /api/subscriptions/:role/:userId      role = resident | provider
// ------------------------------------------------------------
async function getSubscriptions(req, res) {
  try {
    const { role, userId } = req.params;
    if (role !== 'resident' && role !== 'provider') {
      return res.status(400).json({ success: false, message: 'role must be resident or provider' });
    }
    const column = role === 'resident' ? 'residentId' : 'providerId';

    const rows = await Subscription.findAll({
      where: { [column]: userId },
      include: [
        {
          model: User, as: 'resident', attributes: ['id', 'name', 'contact'],
          include: [{ model: Address, as: 'address', attributes: LOCATION_ATTRS }],
        },
        {
          model: User, as: 'provider', attributes: ['id', 'name', 'contact'],
          include: [{ model: Address, as: 'address', attributes: LOCATION_ATTRS }],
        },
      ],
      order: [['fromTime', 'ASC'], ['slotIndex', 'ASC'], ['id', 'ASC']],
    });

    const subscriptions = rows.map((s) => ({
      id: s.id,
      requestId: s.requestId,
      service: s.service,
      serviceLabel: SERVICE_LABEL[s.service] || s.service,
      days: s.days.split(','),
      from: s.fromTime,
      to: s.toTime,
      details: s.details,
      startDate: dateOnly(s.startDate),
      monthlyRate: Number(s.monthlyRate) || 0,
      status: s.status,
      slotIndex: s.slotIndex == null ? 0 : Number(s.slotIndex),   // andruni 10-minute ki jagah (dikhai nahi jati)
      resident: {
        id: s.resident.id, name: s.resident.name, contact: s.resident.contact,
        address: fullAddress(s.resident.address),
        lat: num(s.resident.address && s.resident.address.latitude),
        lng: num(s.resident.address && s.resident.address.longitude),
      },
      provider: {
        id: s.provider.id, name: s.provider.name, contact: s.provider.contact,
        lat: num(s.provider.address && s.provider.address.latitude),
        lng: num(s.provider.address && s.provider.address.longitude),
      },
    }));

    res.json({ success: true, subscriptions: subscriptions });
  } catch (error) {
    console.log('getSubscriptions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Subscription provider ki apni honi chahiye
async function ownSubscription(subId, providerId) {
  const sub = await Subscription.findByPk(subId);
  if (!sub) return { error: [404, 'Service not found'] };
  if (Number(sub.providerId) !== Number(providerId)) return { error: [403, 'This service is not yours'] };
  return { sub: sub };
}

// ------------------------------------------------------------
// POST /api/subscriptions/:id/arrive      body: { providerId, date: 'YYYY-MM-DD' }
// Provider "I am arrived" dabata hai.
// ------------------------------------------------------------
async function markArrived(req, res) {
  try {
    const { providerId, date } = req.body;
    if (!DATE_RE.test(String(date))) return res.status(400).json({ success: false, message: 'date is required' });
    const found = await ownSubscription(Number(req.params.id), providerId);
    if (found.error) return res.status(found.error[0]).json({ success: false, message: found.error[1] });

    const delivery = await getOrCreateDelivery(found.sub.id, date);
    if (delivery.skippedAt) {
      return res.status(409).json({ success: false, message: 'The resident skipped this service for this day' });
    }

    if (!delivery.arrivedAt) await delivery.update({ arrivedAt: new Date() });
    res.json({ success: true });
  } catch (error) {
    console.log('markArrived error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// POST /api/subscriptions/:id/complete    body: { providerId, date }
// Provider "Service done" dabata hai.
// ------------------------------------------------------------
async function markCompleted(req, res) {
  try {
    const { providerId, date } = req.body;
    if (!DATE_RE.test(String(date))) return res.status(400).json({ success: false, message: 'date is required' });
    const found = await ownSubscription(Number(req.params.id), providerId);
    if (found.error) return res.status(found.error[0]).json({ success: false, message: found.error[1] });

    const delivery = await getOrCreateDelivery(found.sub.id, date);
    const now = new Date();
    await delivery.update({
      arrivedAt: delivery.arrivedAt || now,
      completedAt: delivery.completedAt || now,
    });
    res.json({ success: true });
  } catch (error) {
    console.log('markCompleted error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { getSubscriptions, markArrived, markCompleted };
