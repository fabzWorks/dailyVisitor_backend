const express = require('express');
const router = express.Router();
const c = require('../controllers/deliveryController');

router.post('/', c.skipServices);                 // POST /api/skips

module.exports = router;
