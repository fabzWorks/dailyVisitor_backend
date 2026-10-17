const express = require('express');
const router = express.Router();
const c = require('../controllers/requestController');

router.post('/match', c.matchProviders);          // POST /api/requests/match
router.post('/', c.createRequest);                // POST /api/requests
router.post('/:id/respond', c.respondToRequest);  // POST /api/requests/:id/respond

module.exports = router;
