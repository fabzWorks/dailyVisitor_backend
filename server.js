require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

async function startServer() {
  const dbName = process.env.DB_NAME;
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT) || 3306;

  try {
    // 1. Sab se pehle raw connection se database create karein (agar nahi hai)
    const connection = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.end();
    console.log(`\n✅ Database "${dbName}" tayyar hai.`);

    // 2. Database banne ke BAAD models aur routes load karein
    const db = require('./models');
    const apiRoutes = require('./routes');

    const app = express();
    app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
    app.use(express.json());
    app.use('/api', apiRoutes);

    // 3. Tables banayein (sirf wo jo nahi hain). Model change karne par DB_ALTER=true ke sath chalayein.
    await db.sequelize.sync({ alter: process.env.DB_ALTER === 'true' });
    console.log('✅ Tables sync ho gayi.');

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`🚀 Backend running on http://localhost:${port}\n`);
    });
  } catch (error) {
    console.error('\n❌ Server start karne mein error aaya:', error.message);
    const code = error.code || (error.original && error.original.code);
    if (!dbName) console.error('👉 .env file main DB_NAME likhein.');
    else if (code === 'ECONNREFUSED') console.error('👉 MySQL server band hai ya port galat hai. Workbench main connection kholkar check karein (DB_HOST / DB_PORT).');
    else if (code === 'ER_ACCESS_DENIED_ERROR') console.error('👉 User ya password galat hai. .env ke DB_USER / DB_PASSWORD ko Workbench wali connection se milayein.');
    else if (code === 'ER_NOT_SUPPORTED_AUTH_MODE') console.error("👉 Workbench main ye chalayein: ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'apna_password';");
    console.error('');
    process.exit(1);
  }
}

startServer();
