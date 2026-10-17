const express = require('express');
const router = express.Router();
const c = require('../controllers/subscriptionController');

router.get('/:role/:userId', c.getSubscriptions); // GET  /api/subscriptions/resident/5
router.post('/:id/arrive', c.markArrived);        // POST /api/subscriptions/:id/arrive    (provider: "I am arrived")
router.post('/:id/complete', c.markCompleted);    // POST /api/subscriptions/:id/complete  (provider: "Service done")

module.exports = router;
