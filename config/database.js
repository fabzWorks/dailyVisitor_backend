const path = require('path');
// .env hamesha is project ke folder se parhi jaye (chahe terminal kisi bhi folder se khola ho)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Sequelize } = require('sequelize');

// MySQL Workbench wali connection ki settings yahin se aati hain (.env file)
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  }
);

module.exports = sequelize;
