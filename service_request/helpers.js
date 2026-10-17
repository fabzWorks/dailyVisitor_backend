
// helpers.js  -  small things used by the other files


// Names shown to the user
const SERVICE_LABEL = {
  milkman: 'Milk Delivery',
  newspaper: 'Newspaper',
  garbage: 'Garbage Collection',
};

// label + unit for every milk product
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

// Residents say "ghee", providers say "butter". They are the same product.
function fixName(id) {
  if (id === 'ghee') return 'butter';
  return id;
}

// Read JSON text from the database. If it is empty or broken, return `fallback`.
function readJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

// Turn a Date (or text) into "YYYY-MM-DD"
function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return value.getFullYear() + '-' + month + '-' + day;
}

// Distance in km between two points on the map (Haversine formula)
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
function fullAddress(row) {
  if (!row) return '';
  const parts = [];
  if (row.address) parts.push(row.address);
  if (row.area && !String(row.address || '').includes(row.area)) parts.push(row.area);
  if (row.city) parts.push(row.city);
  return parts.join(', ');
}

// The frontend sends the resident's requirement as "groups".
// One group = some days + one time window + the items wanted.
// This function keeps only the useful fields and fixes the names.
function cleanGroups(rawGroups) {
  const groups = [];
  if (!Array.isArray(rawGroups)) return groups;

  for (const g of rawGroups) {
    if (!g || !Array.isArray(g.days) || g.days.length === 0) continue; // skip groups with no day

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

// Returns an error message if the requirement is wrong, otherwise null
function checkRequirement(service, groups) {
  if (!SERVICE_LABEL[service]) return 'Wrong service';
  if (groups.length === 0) return 'Select at least one day';

  for (const g of groups) {
    if (!g.from || !g.to || g.from >= g.to) return 'Time slot is not correct';
    // whole hours only, exactly one hour (8:00 - 9:00). Minutes are not allowed.
    const hourOk = (t) => /^\d{2}:00$/.test(t);
    const hours = (Number(g.to.slice(0, 2)) - Number(g.from.slice(0, 2)));
    if (!hourOk(g.from) || !hourOk(g.to) || hours !== 1) return 'Time slot must be one full hour (for example 8:00 to 9:00)';
    if (service === 'milkman' && Object.keys(g.productQtys).length === 0) return 'Select a milk product';
    if (service === 'newspaper' && g.papers.length === 0) return 'Select a newspaper';
  }
  return null;
}

module.exports = {
  SERVICE_LABEL, MILK_INFO, PAPER_LABEL,
  fixName, readJson, dateOnly, distanceKm, fullAddress, cleanGroups, checkRequirement,
};
