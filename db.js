// MySQL connection (ek hi jagah bana hai, dono folder isay use krty hain)
require('dotenv').config();
const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',

  database: process.env.DB_NAME || 'daily_visitor',
});

module.exports = db;
