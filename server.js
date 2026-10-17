require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./Auth/auth.routes');
const requestRoutes = require('./service_request/request.routes');

const db = require('./db');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

// test route
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Backend chal raha hai' });
});

// login + signup  ->  /api/auth/...
app.use('/api/auth', authRoutes);

// service request flow  ->  /api/requests, /api/notifications, /api/subscriptions
app.use('/api', requestRoutes);

// Creates what the new features need if it is missing (same as database_update_v5.sql),
// so you do not have to run any SQL by hand.
async function ensureSchema() {
  try {
    const [subs] = await db.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions'"
    );
    if (subs.length > 0 && !subs.some((c) => c.COLUMN_NAME === 'slot_index')) {
      await db.query('ALTER TABLE subscriptions ADD COLUMN slot_index TINYINT NULL');
    }
    const [ps] = await db.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'provider_service'"
    );
    if (ps.length > 0 && !ps.some((c) => c.COLUMN_NAME === 'weight')) {
      await db.query('ALTER TABLE provider_service ADD COLUMN weight DECIMAL(6,1) NULL AFTER newspaper_types');
    }
    if (subs.length > 0) {
      await db.query(`CREATE TABLE IF NOT EXISTS deliveries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subscription_id INT NOT NULL,
        delivery_date DATE NOT NULL,
        arrived_at DATETIME NULL,
        completed_at DATETIME NULL,
        resident_note VARCHAR(500) NULL,
        noted_at DATETIME NULL,
        UNIQUE KEY uq_sub_date (subscription_id, delivery_date),
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
      )`);
    }
  } catch (error) {
    console.log('Could not check the database tables:', error.message);
  }
}

const port = process.env.PORT || 4000;
ensureSchema().then(() => {
  app.listen(port, () => {
    console.log('Backend running on http://localhost:' + port);
  });
});