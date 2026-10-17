const db = require('../db');
const { joinAddress } = require('../utils');



// Checks name / email / password. Returns an error text, or null if all is fine.
function checkBasics(body) {
  const { name, email, password, confirmPassword } = body;

  if (!name || !email || !password) return 'add name email and password must';
  // anything before the @ is fine, but the email must end with @gmail.com
  if (!/^[^\s@]+@gmail\.com$/i.test(String(email).trim())) return 'Email must look like name@gmail.com';
  if (!/^\d{11}$/.test(String(body.contact || ''))) return 'Mobile number must be exactly 11 digits';
  if (password.length < 8) return 'Password length must be of 8 character';
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Passwords match nahi kar rahe';
  return null;
}

// Is this email already used?
async function emailExists(email) {
  const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  return rows.length > 0;
}

// Saves the person in "users" and his map location in "address". Returns the new user id.
async function saveUser(role, body, email) {
  const { name, password, gender, contact, latitude, longitude, country, province, city, area, address } = body;

  const [result] = await db.query(
    `INSERT INTO users (role, name, email, password, gender, contact)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [role, name.trim(), email, password, gender || null, contact || null]
  );
  const userId = result.insertId;

  await db.query(
    `INSERT INTO address (user_id, latitude, longitude, country, province, city, area, address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, latitude || null, longitude || null, country || null, province || null,
     city || null, area || null, address || null]
  );
  return userId;
}

// ---------- RESIDENT SIGNUP ----------
async function signupResident(req, res) {
  try {
    const body = req.body;

    const problem = checkBasics(body);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const email = body.email.trim().toLowerCase();
    if (await emailExists(email)) {
      return res.status(409).json({ success: false, message: 'Ye email pehle se use ho chuki hai' });
    }

    const userId = await saveUser('resident', body, email);

    res.status(201).json({
      success: true,
      message: 'Resident account ban gaya',
      user: {
        id: userId, role: 'resident', name: body.name.trim(), email: email,
        contact: body.contact || null,
        address: joinAddress(body.address, body.area, body.city),
      },
    });
  } catch (error) {
    console.log('Resident signup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ---------- PROVIDER (VISITOR) SIGNUP ----------
async function signupProvider(req, res) {
  try {
    const body = req.body;
    const { service, servicePrice, products, newspapers, weight, days, timeSlots } = body;

    
    const problem = checkBasics(body);
    if (problem) return res.status(400).json({ success: false, message: problem });

    if (!['milkman', 'garbage', 'newspaper'].includes(service)) {
      return res.status(400).json({ success: false, message: 'Service is wrong' });
    }

    
    const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cleanDays = allDays.filter((d) => Array.isArray(days) && days.includes(d));
    if (cleanDays.length === 0) {
      return res.status(400).json({ success: false, message: 'select atleast one day' });
    }

    if (!timeSlots || timeSlots.length === 0) {
      return res.status(400).json({ success: false, message: 'atleast select one time slot' });
    }
    for (const slot of timeSlots) {
      if (!slot.from || !slot.to || slot.from >= slot.to) {
        return res.status(400).json({ success: false, message: 'time slot is not correct' });
      }
    }

    if (service === 'milkman' && (!products || products.length === 0)) {
      return res.status(400).json({ success: false, message: 'atleast select one product from milkman services' });
    }

    if (service === 'garbage' && !(Number(weight) > 0)) {
      return res.status(400).json({ success: false, message: 'plz tell garbage weight' });
    }

    const email = body.email.trim().toLowerCase();
    if (await emailExists(email)) {
      return res.status(409).json({ success: false, message: 'email already exists' });
    }

    // 2) uper wala data user or adress ka
    const userId = await saveUser('provider', body, email);

    // 3) save hongi  provider_service  (products / newspapers / time slots stored hongy as JSON text)
    const cleanSlots = timeSlots.map((s) => ({ from: s.from, to: s.to }));
    await db.query(
      `INSERT INTO provider_service
       (user_id, service, service_price, milk_products, newspaper_types, weight, days, time_slots)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        service,
        servicePrice || null,
        service === 'milkman' ? JSON.stringify(products) : null,
        service === 'newspaper' && newspapers ? JSON.stringify(newspapers) : null,
        service === 'garbage' ? Number(weight) : null,
        cleanDays.join(','),
        JSON.stringify(cleanSlots),
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Service provider account ban gaya',
      user: {
        id: userId, role: 'provider', name: body.name.trim(), email: email, service: service,
        contact: body.contact || null,
        address: joinAddress(body.address, body.area, body.city),
      },
    });
  } catch (error) {
    console.log('Provider signup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { signupResident, signupProvider };