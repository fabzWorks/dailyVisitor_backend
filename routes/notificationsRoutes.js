const express = require('express');
const router = express.Router();
const c = require('../controllers/notificationController');

router.get('/:userId', c.getNotifications);       // GET /api/notifications/:userId

module.exports = router;
