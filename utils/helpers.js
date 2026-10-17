// helpers.js  -  chhoti chhoti cheezein jo baqi files use karti hain

const SERVICE_LABEL = {
  milkman: 'Milk Delivery',
  newspaper: 'Newspaper',
  garbage: 'Garbage Collection',
};

const MILK_INFO = {
  cow:    { label: 'Cow Milk',      unit: 'L'  },
  goat:   { label: 'Goat Milk',     unit: 'L'  },
  camel:  { label: 'Camel Milk',    unit: 'L'  },
  cheese: { label: 'Cheese',        unit: 'kg' },
  butter: { label: 'Butter / Ghee', unit: 'kg' },
};

const PAPER_LABEL = {
  dawn: 'Dawn', thenews: 'The News', jang: 'Jang',
  express: 'Express', tribune: 'Tribune', geo: 'Geo',
};

// Resident "ghee" kehta hai, provider "butter". Dono aik hi product hain.
function fixName(id) {
  return id === 'ghee' ? 'butter' : id;
}

// JSON column ki value. Khali / kharab ho to `fallback` wapis.
// (Sequelize JSON column se pehle hi object de deta hai, text ho to parse karta hai)
function readJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

// Date (ya text) ko "YYYY-MM-DD" bana do
function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return value.getFullYear() + '-' + month + '-' + day;
}

// Map par do points ke beech km (Haversine formula)
function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// "Street 7" + "G-9/4" + "Islamabad"  ->  "Street 7, G-9/4, Islamabad"
function joinAddress(street, area, city) {
  const parts = [];
  if (street) parts.push(street);
  if (area && !(street && String(street).includes(area))) parts.push(area);
  if (city) parts.push(city);
  return parts.join(', ');
}

// Same cheez, lekin aik object (row) se
function fullAddress(row) {
  if (!row) return '';
  return joinAddress(row.address, row.area, row.city);
}

// Frontend resident ki requirement "groups" main bhejta hai.
// Aik group = kuch din + aik time window + chahiye items.
function cleanGroups(rawGroups) {
  const groups = [];
  if (!Array.isArray(rawGroups)) return groups;

  for (const g of rawGroups) {
    if (!g || !Array.isArray(g.days) || g.days.length === 0) continue;

    const productQtys = {};
    const oldQtys = g.productQtys || {};
    for (const id of Object.keys(oldQtys)) {
      productQtys[fixName(id)] = Number(oldQtys[id]) || 0;
    }

    groups.push({
      days: g.days,
      from: g.from,
      to: g.to,
      milkProducts: (g.milkProducts || []).map(fixName),
      productQtys: productQtys,
      papers: g.papers || [],
      garbageKg: Number(g.garbageKg) || 0,
    });
  }
  return groups;
}

// Requirement galat ho to error message, warna null
function checkRequirement(service, groups) {
  if (!SERVICE_LABEL[service]) return 'Wrong service';
  if (groups.length === 0) return 'Select at least one day';

  for (const g of groups) {
    if (!g.from || !g.to || g.from >= g.to) return 'Time slot is not correct';
    // sirf poora ghanta (8:00 - 9:00), minutes allowed nahi
    const hourOk = (t) => /^\d{2}:00$/.test(t);
    const hours = Number(g.to.slice(0, 2)) - Number(g.from.slice(0, 2));
    if (!hourOk(g.from) || !hourOk(g.to) || hours !== 1) return 'Time slot must be one full hour (for example 8:00 to 9:00)';
    if (service === 'milkman' && Object.keys(g.productQtys).length === 0) return 'Select a milk product';
    if (service === 'newspaper' && g.papers.length === 0) return 'Select a newspaper';
  }
  return null;
}

module.exports = {
  SERVICE_LABEL, MILK_INFO, PAPER_LABEL,
  fixName, readJson, dateOnly, distanceKm, joinAddress, fullAddress, cleanGroups, checkRequirement,
};
