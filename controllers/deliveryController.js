// deliveryController.js  -  resident ke note, deliveries ki state, skip
const { Op } = require('sequelize');
const { Subscription, Delivery } = require('../models');
const { dateOnly } = require('../utils/helpers');
const { DATE_RE, getOrCreateDelivery } = require('../utils/deliveryHelpers');

// ------------------------------------------------------------
// POST /api/deliveries/:id/note           body: { residentId, note }
// Resident "provider arrived" notification par extra note likhta hai.
// Provider sirf dekh sakta hai.
// ------------------------------------------------------------
async function saveDeliveryNote(req, res) {
  try {
    const deliveryId = Number(req.params.id);
    const { residentId } = req.body;
    const note = String(req.body.note || '').trim().slice(0, 500);
    if (!note) return res.status(400).json({ success: false, message: 'Write a note first' });

    const delivery = await Delivery.findByPk(deliveryId, {
      include: [{ model: Subscription, as: 'subscription', attributes: ['residentId'] }],
    });
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });
    if (Number(delivery.subscription.residentId) !== Number(residentId)) {
      return res.status(403).json({ success: false, message: 'This delivery is not yours' });
    }
    if (delivery.residentNote) return res.status(409).json({ success: false, message: 'Note was already sent' });

    await delivery.update({ residentNote: note, notedAt: new Date() });
    res.json({ success: true });
  } catch (error) {
    console.log('saveDeliveryNote error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// GET /api/deliveries/:role/:userId      role = resident | provider
// Pichle 90 din ki arrived / completed state (pending / completed / missed ke liye)
// ------------------------------------------------------------
async function getDeliveries(req, res) {
  try {
    const { role, userId } = req.params;
    if (role !== 'resident' && role !== 'provider') {
      return res.status(400).json({ success: false, message: 'role must be resident or provider' });
    }
    const column = role === 'resident' ? 'residentId' : 'providerId';

    const from = new Date();
    from.setDate(from.getDate() - 90);
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const rows = await Delivery.findAll({
      where: { deliveryDate: { [Op.gte]: dateOnly(from) } },
      include: [{ model: Subscription, as: 'subscription', required: true, where: { [column]: userId }, attributes: [] }],
    });

    res.json({
      success: true,
      deliveries: rows.map((d) => ({
        id: d.id,
        subscriptionId: d.subscriptionId,
        date: d.deliveryDate,
        arrivedAt: d.arrivedAt,
        completedAt: d.completedAt,
        // note sirf arrive hone ke 24 ghante tak dikhta hai
        note: d.arrivedAt && new Date(d.arrivedAt).getTime() >= dayAgo ? d.residentNote || null : null,
      })),
    });
  } catch (error) {
    console.log('getDeliveries error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// POST /api/skips     body: { residentId, items: [{ subscriptionId, date }] }
// Resident kuch dinon ki service skip karta hai. Har service ke har din ki aik row.
// ------------------------------------------------------------
async function skipServices(req, res) {
  try {
    const { residentId, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Select a service to skip' });
    }

    // pehle sab check karo, phir save
    const today = dateOnly(new Date());
    for (const it of items) {
      if (!DATE_RE.test(String(it.date))) return res.status(400).json({ success: false, message: 'Wrong date' });
      if (it.date < today) return res.status(400).json({ success: false, message: 'You cannot skip a past day' });
      const sub = await Subscription.findByPk(it.subscriptionId, { attributes: ['id', 'residentId'] });
      if (!sub) return res.status(404).json({ success: false, message: 'Service not found' });
      if (Number(sub.residentId) !== Number(residentId)) {
        return res.status(403).json({ success: false, message: 'This service is not yours' });
      }
    }

    for (const it of items) {
      const delivery = await getOrCreateDelivery(it.subscriptionId, it.date);
      // jo service ho chuki hai usay skip nahi kar sakte
      if (!delivery.completedAt && !delivery.skippedAt) await delivery.update({ skippedAt: new Date() });
    }
    res.json({ success: true });
  } catch (error) {
    console.log('skipServices error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { saveDeliveryNote, getDeliveries, skipServices };
