// authController.js  -  login + resident signup + provider signup (sab ORM se)
const { sequelize, User, Address, ProviderService } = require('../models');
const { joinAddress } = require('../utils/helpers');

// name / email / password check. Error text wapis, sab theek ho to null.
function checkBasics(body) {
  const { name, email, password, confirmPassword } = body;

  if (!name || !email || !password) return 'add name email and password must';
  if (!/^[^\s@]+@gmail\.com$/i.test(String(email).trim())) return 'Email must look like name@gmail.com';
  if (!/^\d{11}$/.test(String(body.contact || ''))) return 'Mobile number must be exactly 11 digits';
  if (password.length < 8) return 'Password length must be of 8 character';
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Passwords match nahi kar rahe';
  return null;
}

// User + Address (aur provider ho to ProviderService) aik transaction main save.
// Aik bhi step fail ho to kuch bhi save nahi hota.
async function saveUser(role, body, email, serviceData) {
  const { name, password, gender, contact, latitude, longitude, country, province, city, area, address } = body;

  return sequelize.transaction(async (t) => {
    const user = await User.create(
      { role, name: name.trim(), email, password, gender: gender || null, contact: contact || null },
      { transaction: t }
    );

    await Address.create(
      {
        userId: user.id,
        latitude: latitude || null, longitude: longitude || null,
        country: country || null, province: province || null,
        city: city || null, area: area || null, address: address || null,
      },
      { transaction: t }
    );

    if (serviceData) {
      await ProviderService.create({ userId: user.id, ...serviceData }, { transaction: t });
    }
    return user.id;
  });
}

// ---------- LOGIN ----------
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email aur password dalein' });
    }

    const u = await User.findOne({
      where: { email: email.trim().toLowerCase(), password: password },
      include: [
        { model: Address, as: 'address', required: false },
        { model: ProviderService, as: 'providerService', required: false, attributes: ['service'] },
      ],
    });
    if (!u) {
      return res.status(401).json({ success: false, message: 'Email or password is wrong' });
    }

    const user = {
      id: u.id,
      role: u.role,
      name: u.name,
      email: u.email,
      contact: u.contact,
      address: joinAddress(u.address && u.address.address, u.address && u.address.area, u.address && u.address.city),
    };
    if (u.role === 'provider' && u.providerService) user.service = u.providerService.service;

    res.json({ success: true, message: 'Login ho gaya', user: user });
  } catch (error) {
    console.log('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ---------- RESIDENT SIGNUP ----------
async function signupResident(req, res) {
  try {
    const body = req.body;

    const problem = checkBasics(body);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const email = body.email.trim().toLowerCase();
    if (await User.findOne({ where: { email }, attributes: ['id'] })) {
      return res.status(409).json({ success: false, message: 'Ye email pehle se use ho chuki hai' });
    }

    const userId = await saveUser('resident', body, email, null);

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
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'Ye email pehle se use ho chuki hai' });
    }
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

    if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
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
    if (await User.findOne({ where: { email }, attributes: ['id'] })) {
      return res.status(409).json({ success: false, message: 'email already exists' });
    }

    const serviceData = {
      service,
      servicePrice: servicePrice || null,
      milkProducts: service === 'milkman' ? products : null,
      newspaperTypes: service === 'newspaper' && newspapers ? newspapers : null,
      weight: service === 'garbage' ? Number(weight) : null,
      days: cleanDays.join(','),
      timeSlots: timeSlots.map((s) => ({ from: s.from, to: s.to })),
    };
    const userId = await saveUser('provider', body, email, serviceData);

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
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'email already exists' });
    }
    console.log('Provider signup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { login, signupResident, signupProvider };
