const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

router.post('/login', auth.login);                      // POST /api/auth/login
router.post('/signup/resident', auth.signupResident);   // POST /api/auth/signup/resident
router.post('/signup/provider', auth.signupProvider);   // POST /api/auth/signup/provider

module.exports = router;
