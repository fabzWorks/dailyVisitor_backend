
const db = require('../db');
const { joinAddress } = require('../utils');

async function login(req, res) {
  try {
    // yhn pr email or password ki value store ho gi 
    const { email, password } = req.body;

  
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email aur password dalein' });
    }



    
    const [rows] = await db.query(
      `SELECT u.id, u.role, u.name, u.email, u.contact,
              a.address AS street, a.area, a.city,
              ps.service
       FROM users u
       LEFT JOIN address a ON a.user_id = u.id
       LEFT JOIN provider_service ps ON ps.user_id = u.id
       WHERE u.email = ? AND u.password = ?`,
      [email.trim().toLowerCase(), password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Email or password is wrong' });
    }


    const u = rows[0];
    const user = {
      id: u.id,
      role: u.role,                      
      name: u.name,
      email: u.email,
      contact: u.contact,
      address: joinAddress(u.street, u.area, u.city),
    };
    if (u.role === 'provider') user.service = u.service;

    res.json({ success: true, message: 'Login ho gaya', user: user });
  } catch (error) {
    console.log('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { login };