// pricing.js  -  paison ka exact hisaab
//
// Start date se 30 din ka asli calendar dekha jata hai.
// Misal: start Mon 5 Oct, din Mon+Tue+Wed -> Mon x5, Tue x5, Wed x4 = 14 deliveries
// Aik item ka kharcha = quantity x rate x deliveries
const { readJson, fixName, MILK_INFO, PAPER_LABEL } = require('./helpers');

const BILLING_DAYS = 30;
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const JS_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function round2(number) {
  return Math.round(number * 100) / 100;
}

// 30 din main har weekday kitni baar aata hai -> { Mon: 5, Tue: 5, ... } aur aakhri date
function countWeekdays(startDate) {
  const counts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const [year, month, day] = startDate.split('-').map(Number);

  let lastDate = '';
  for (let i = 0; i < BILLING_DAYS; i++) {
    const date = new Date(Date.UTC(year, month - 1, day + i));
    counts[JS_DAY_NAMES[date.getUTCDay()]] += 1;
    lastDate = date.toISOString().slice(0, 10);
  }
  return { counts: counts, lastDate: lastDate };
}

// Provider ka aik item ka rate
function rateOf(provider, service, itemId) {
  if (service === 'milkman') {
    const products = readJson(provider.milkProducts, []);
    for (const p of products) {
      if (fixName(p.name) === itemId) return Number(p.price) || 0;
    }
    return 0;
  }
  return Number(provider.servicePrice) || 0; // newspaper (per copy) / garbage (per kg)
}

// Aik group ki lines: [{ label, qty, unit, rate }]
function itemLines(provider, service, group) {
  const lines = [];

  if (service === 'milkman') {
    for (const id of Object.keys(group.productQtys)) {
      const info = MILK_INFO[id] || { label: id, unit: '' };
      lines.push({ label: info.label, qty: group.productQtys[id], unit: info.unit, rate: rateOf(provider, service, id) });
    }
  }
  if (service === 'newspaper') {
    for (const id of group.papers) {
      lines.push({ label: PAPER_LABEL[id] || id, qty: 1, unit: 'copy', rate: rateOf(provider, service, id) });
    }
  }
  if (service === 'garbage') {
    lines.push({ label: 'Garbage collection', qty: group.garbageKg, unit: 'kg', rate: rateOf(provider, service, 'garbage') });
  }
  return lines;
}

// Summary screen ka poora hisaab
function buildBreakdown(provider, service, groups, startDate) {
  const weekdays = countWeekdays(startDate);
  const groupResults = [];
  let totalDeliveries = 0;
  let total = 0;

  for (const group of groups) {
    const days = DAY_ORDER.filter((d) => group.days.includes(d));
    const perDay = [];
    let deliveries = 0;
    for (const d of days) {
      perDay.push({ day: d, count: weekdays.counts[d] });
      deliveries += weekdays.counts[d];
    }

    const lines = [];
    let perDelivery = 0;
    let groupTotal = 0;
    for (const line of itemLines(provider, service, group)) {
      const costOneDelivery = round2(line.qty * line.rate);
      const costAll = round2(line.qty * line.rate * deliveries);
      lines.push({ ...line, perDelivery: costOneDelivery, total: costAll });
      perDelivery += costOneDelivery;
      groupTotal += costAll;
    }

    groupResults.push({
      days: days, from: group.from, to: group.to,
      perDay: perDay, deliveries: deliveries, lines: lines,
      perDelivery: round2(perDelivery), total: round2(groupTotal),
    });
    totalDeliveries += deliveries;
    total += groupTotal;
  }

  return {
    startDate: startDate,
    endDate: weekdays.lastDate,
    cycleDays: BILLING_DAYS,
    groups: groupResults,
    totalDeliveries: totalDeliveries,
    total: round2(total),
  };
}

// Items ka chhota text, e.g. "Cow Milk: 1L, Cheese: 0.5kg"
function describeGroup(service, group) {
  if (service === 'milkman') {
    const parts = [];
    for (const id of Object.keys(group.productQtys)) {
      const info = MILK_INFO[id] || { label: id, unit: '' };
      parts.push(info.label + ': ' + group.productQtys[id] + info.unit);
    }
    return parts.join(', ');
  }
  if (service === 'newspaper') return group.papers.map((id) => PAPER_LABEL[id] || id).join(', ');
  return '~' + group.garbageKg + ' kg';
}

module.exports = { buildBreakdown, describeGroup };
