// deliveryHelpers.js  -  deliveries table ke chhote kaam
const { Delivery } = require('../models');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Is subscription + date ki row le lo, na ho to bana do (unique: subscription_id + delivery_date)
async function getOrCreateDelivery(subscriptionId, date) {
  const [delivery] = await Delivery.findOrCreate({
    where: { subscriptionId: subscriptionId, deliveryDate: date },
  });
  return delivery;
}

module.exports = { DATE_RE, getOrCreateDelivery };
