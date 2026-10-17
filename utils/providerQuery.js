// providerQuery.js  -  provider ko users + provider_service + address ke sath ORM se nikalna
const { User, Address, ProviderService } = require('../models');

// ORM ka nested object -> aik sada (flat) object jo matching / pricing use karte hain
function flattenProvider(user) {
  const ps = user.providerService;
  const a = user.address;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    contact: user.contact,
    gender: user.gender,
    service: ps.service,
    servicePrice: ps.servicePrice,
    milkProducts: ps.milkProducts,
    newspaperTypes: ps.newspaperTypes,
    weight: ps.weight,
    days: ps.days,
    timeSlots: ps.timeSlots,
    latitude: a ? a.latitude : null,
    longitude: a ? a.longitude : null,
    area: a ? a.area : null,
    city: a ? a.city : null,
    address: a ? a.address : null,
  };
}

function providerInclude(service) {
  return [
    { model: ProviderService, as: 'providerService', required: true, ...(service ? { where: { service } } : {}) },
    { model: Address, as: 'address', required: false },
  ];
}

// Is service ke saare providers
async function findProviders(service) {
  const users = await User.findAll({
    where: { role: 'provider' },
    include: providerInclude(service),
  });
  return users.map(flattenProvider);
}

// Aik provider (ya null)
async function findProviderById(providerId) {
  const user = await User.findOne({
    where: { id: providerId, role: 'provider' },
    include: providerInclude(null),
  });
  return user ? flattenProvider(user) : null;
}

// Resident ka address
async function getAddress(userId) {
  return Address.findOne({ where: { userId } });
}

module.exports = { findProviders, findProviderById, getAddress };
