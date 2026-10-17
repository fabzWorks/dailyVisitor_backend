//Ye auth ki routes file hai. Ye sirf URL batati hai aur kaun sa controller chalega.

const express = require('express');
const { login } = require('./login.controller');
const { signupResident, signupProvider } = require('./signup.controller');

const router = express.Router();

router.post('/login', login);                         // POST /api/auth/login           
router.post('/signup/resident', signupResident);      // POST /api/auth/signup/resident
router.post('/signup/provider', signupProvider);      // POST /api/auth/signup/provider  

module.exports = router;
