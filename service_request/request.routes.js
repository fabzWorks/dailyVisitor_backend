const express = require('express');
const c = require('./request.controller');

const router = express.Router();

router.post('/requests/match', c.matchProviders);            // POST /api/requests/match
router.post('/requests', c.createRequest);                   // POST /api/requests
router.post('/requests/:id/respond', c.respondToRequest);    // POST /api/requests/:id/respond

router.get('/notifications/:userId', c.getNotifications);    // GET  /api/notifications/:userId  (built live, nothing stored)

router.get('/subscriptions/:role/:userId', c.getSubscriptions);   // GET  /api/subscriptions/resident/5

router.post('/subscriptions/:id/arrive', c.markArrived);          // provider: "I am arrived"
router.post('/subscriptions/:id/complete', c.markCompleted);      // provider: "Service done"
router.post('/deliveries/:id/note', c.saveDeliveryNote);          // resident: extra note on the arrival notification
router.get('/deliveries/:role/:userId', c.getDeliveries);         // arrived / completed state of deliveries
router.post('/skips', c.skipServices);                            // resident: skip services on chosen dates
module.exports = router;
