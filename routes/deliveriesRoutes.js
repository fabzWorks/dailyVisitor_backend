const express = require('express');
const router = express.Router();
const c = require('../controllers/deliveryController');

router.post('/:id/note', c.saveDeliveryNote);     // POST /api/deliveries/:id/note
router.get('/:role/:userId', c.getDeliveries);    // GET  /api/deliveries/resident/5

module.exports = router;
