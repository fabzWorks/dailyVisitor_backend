const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const basename = path.basename(__filename);

// test route  ->  GET /api/health
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Backend chal raha hai' });
});

// routes folder ki har file khud load hoti hai.
// File ka naam hi URL banta hai:  authRoutes.js -> /api/auth ,  requestsRoutes.js -> /api/requests
fs.readdirSync(__dirname)
  .filter((file) => file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js')
  .forEach((file) => {
    const route = require(path.join(__dirname, file));
    const routeName = file.replace('Routes.js', '').replace('.js', '').toLowerCase();
    router.use(`/${routeName}`, route);
  });

module.exports = router;
