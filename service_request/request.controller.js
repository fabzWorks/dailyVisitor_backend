
// request.controller.js  -  API functions of the "subscribe a service" flow
//
//   matchProviders         resident taps "Find Providers"  -> list of matching providers
//   createRequest          resident taps "Confirm"         -> request saved
//   respondToRequest       provider taps Accept / Reject   -> schedule created on accept
//                          (each accepted resident gets his own 10-minute place inside the hour)
//   getNotifications       notification bar of any user. NOTHING is stored for it:
//                          the list is built live from requests + deliveries and
//                          every item disappears 24 hours after it happened.
//   getSubscriptions       schedule of a resident or a provider
//   markArrived            provider taps "I am arrived"    -> resident sees it (and can add a note)
//   markCompleted          provider taps "Service done"    -> resident sees "service done"
//   saveDeliveryNote       resident adds a note to the arrival notification -> provider can view it
//   getDeliveries          arrived / completed state of every delivery (for pending / completed / missed)// ============================================================
const db = require('../db');
const {
  SERVICE_LABEL, MILK_INFO, PAPER_LABEL,
  fixName, readJson, dateOnly, fullAddress, cleanGroups, checkRequirement,
} = require('./helpers');
const { providerMatches, allotPlace } = require('./matching');
const { buildBreakdown, describeGroup } = require('./pricing');

// SQL that gets a provider together with his service details and map location
const PROVIDER_SQL = `
  SELECT u.id, u.name, u.email, u.contact, u.gender,
         ps.service, ps.service_price, ps.milk_products, ps.newspaper_types, ps.weight, ps.days, ps.time_slots, ps.minutes_per_visit,
         a.latitude, a.longitude, a.area, a.city, a.address
  FROM users u
  JOIN provider_service ps ON ps.user_id = u.id
  LEFT JOIN address a ON a.user_id = u.id
  WHERE u.role = 'provider'`;

async function getAddress(userId) {
  const [rows] = await db.query('SELECT * FROM address WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

// The provider "card" that the frontend shows (list + summary screen)
function makeProviderCard(provider, service, groups, distance, startDate) {
  const breakdown = buildBreakdown(provider, service, groups, startDate);

  const products = readJson(provider.milk_products, []).map((p) => {
    const id = fixName(p.name);
    const info = MILK_INFO[id] || { label: p.name, unit: '' };
    return { id: id, label: info.label, unit: info.unit, price: Number(p.price) || 0 };
  });
  const newspapers = readJson(provider.newspaper_types, []).map((id) => ({ id: id, label: PAPER_LABEL[id] || id }));

  return {
    id: provider.id,
    name: provider.name,
    email: provider.email,
    contact: provider.contact,
    gender: provider.gender,
    service: provider.service,
    serviceLabel: SERVICE_LABEL[provider.service],
    address: fullAddress(provider),
    area: provider.area,
    city: provider.city,
    distanceKm: distance == null ? null : Math.round(distance * 10) / 10,
    products: products,
    newspapers: newspapers,
    servicePrice: provider.service_price == null ? null : Number(provider.service_price),
    days: String(provider.days || '').split(',').filter(Boolean),
    timeSlots: readJson(provider.time_slots, []),
    breakdown: breakdown,
    total: breakdown.total,
  };
}

// ------------------------------------------------------------
// 1) POST /api/requests/match
//    body: { residentId, service, radius, startDate, groups }
//    Only providers that match EXACTLY are returned (no match = empty list)
// ------------------------------------------------------------
async function matchProviders(req, res) {
  try {
    const { residentId, service, radius, startDate, groups: rawGroups } = req.body;
    const groups = cleanGroups(rawGroups);
    const problem = checkRequirement(service, groups);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const start = startDate || dateOnly(new Date());
    const residentAddress = residentId ? await getAddress(residentId) : null;
    const [providers] = await db.query(PROVIDER_SQL + ' AND ps.service = ?', [service]);

    const matches = [];
    for (const provider of providers) {
      const result = await providerMatches(provider, service, groups, Number(radius) || 0, residentAddress);
      if (result.ok) matches.push(makeProviderCard(provider, service, groups, result.distance, start));
    }

    // nearest first
    matches.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    res.json({ success: true, providers: matches });
  } catch (error) {
    console.log('matchProviders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 2) POST /api/requests
//    body: { residentId, providerId, service, startDate, radius, notes, groups }
// ------------------------------------------------------------
async function createRequest(req, res) {
  try {
    const { residentId, providerId, service, startDate, radius, notes, groups: rawGroups } = req.body;
    const groups = cleanGroups(rawGroups);
    const problem = checkRequirement(service, groups);
    if (problem) return res.status(400).json({ success: false, message: problem });
    if (!residentId || !providerId || !startDate) {
      return res.status(400).json({ success: false, message: 'residentId, providerId and startDate are required' });
    }

    // the resident must exist
    const [residents] = await db.query("SELECT id, name FROM users WHERE id = ? AND role = 'resident'", [residentId]);
    if (residents.length === 0) return res.status(404).json({ success: false, message: 'Resident not found' });
    const resident = residents[0];

    // the provider must exist and must STILL match (data may have changed)
    const [providers] = await db.query(PROVIDER_SQL + ' AND u.id = ?', [providerId]);
    if (providers.length === 0) return res.status(404).json({ success: false, message: 'Provider not found' });
    const provider = providers[0];

    const residentAddress = await getAddress(residentId);
    const result = await providerMatches(provider, service, groups, Number(radius) || 0, residentAddress);
    if (!result.ok) {
      return res.status(409).json({ success: false, message: 'This provider no longer matches your requirement' });
    }

    // do not send the same pending request twice
    const [same] = await db.query(
      "SELECT id FROM service_requests WHERE resident_id = ? AND provider_id = ? AND service = ? AND status = 'pending'",
      [residentId, providerId, service]
    );
    if (same.length > 0) {
      return res.status(409).json({ success: false, message: 'You already sent this request to this provider (pending)' });
    }

    const card = makeProviderCard(provider, service, groups, result.distance, startDate);

    // save the request
    const [saved] = await db.query(
      `INSERT INTO service_requests
       (resident_id, provider_id, service, start_date, radius_km, notes, groups_json, estimated_monthly)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [residentId, providerId, service, startDate, Number(radius) || 2, notes || null, JSON.stringify(groups), card.total]
    );

    res.status(201).json({ success: true, message: 'Request sent to the provider', requestId: saved.insertId });
  } catch (error) {
    console.log('createRequest error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 3) POST /api/requests/:id/respond
//    body: { providerId, action: 'accept' | 'reject' }
// ------------------------------------------------------------
async function respondToRequest(req, res) {
  try {
    const requestId = Number(req.params.id);
    const { providerId, action } = req.body;
    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ success: false, message: "action must be 'accept' or 'reject'" });
    }

    const [requests] = await db.query('SELECT * FROM service_requests WHERE id = ?', [requestId]);
    const request = requests[0];
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (Number(request.provider_id) !== Number(providerId)) {
      return res.status(403).json({ success: false, message: 'This request is not for you' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'This request was already answered' });
    }

    // ACCEPT: first find a free 10-minute place inside the hour for every group.
    // If the hour already has 6 residents the request can NOT be accepted.
    const groups = readJson(request.groups_json, []);
    const places = [];
    if (action === 'accept') {
      for (const g of groups) {
        const place = await allotPlace(request.provider_id, g, requestId);
        if (!place.ok) return res.status(409).json({ success: false, message: place.reason });
        places.push(place.slotIndex);
      }
    }

    // Change status only if it is still "pending".
    // If two taps arrive together, only the first one can change it.
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const [update] = await db.query(
      "UPDATE service_requests SET status = ?, responded_at = NOW() WHERE id = ? AND status = 'pending'",
      [newStatus, requestId]
    );
    if (update.affectedRows === 0) {
      return res.status(409).json({ success: false, message: 'This request was already answered' });
    }

    // ACCEPT -> one subscription row per group (this is what the schedules show)
    if (action === 'accept') {
      const [providers] = await db.query(PROVIDER_SQL + ' AND u.id = ?', [providerId]);
      const startDate = dateOnly(request.start_date);
      const breakdown = buildBreakdown(providers[0], request.service, groups, startDate);

      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        await db.query(
          `INSERT INTO subscriptions
           (request_id, resident_id, provider_id, service, days, from_time, to_time, details, start_date, monthly_rate, slot_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [requestId, request.resident_id, request.provider_id, request.service,
           g.days.join(','), g.from, g.to, describeGroup(request.service, g).slice(0, 250),
           startDate, breakdown.groups[i].total, places[i]]
        );
      }
    }

    res.json({ success: true, status: newStatus });
  } catch (error) {
    console.log('respondToRequest error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 4) GET /api/notifications/:userId
//    Nothing is stored. The list is built from the requests / deliveries tables
//    and an item is only returned for 24 hours after it happened.
//    (a provider's still-pending request stays until he answers it)
// ------------------------------------------------------------
const REQUEST_COLUMNS = `
  r.id AS request_id, r.status AS req_status, r.service, r.start_date, r.groups_json, r.estimated_monthly, r.notes,
  res.id AS resident_id, res.name AS resident_name, res.contact AS resident_contact,
  ra.address AS r_address, ra.area AS r_area, ra.city AS r_city,
  prov.id AS provider_id, prov.name AS provider_name, prov.contact AS provider_contact`;
const REQUEST_JOINS = `
  JOIN users res  ON res.id  = r.resident_id
  LEFT JOIN address ra ON ra.user_id = res.id
  JOIN users prov ON prov.id = r.provider_id`;

function requestObject(n) {
  const groups = readJson(n.groups_json, []).map((g) => ({
    days: g.days, from: g.from, to: g.to, details: describeGroup(n.service, g),
  }));
  return {
    id: n.request_id,
    status: n.req_status,
    service: n.service,
    serviceLabel: SERVICE_LABEL[n.service] || n.service,
    startDate: dateOnly(n.start_date),
    groups: groups,
    total: Number(n.estimated_monthly) || 0,
    notes: n.notes,
    resident: {
      id: n.resident_id, name: n.resident_name, contact: n.resident_contact,
      address: fullAddress({ address: n.r_address, area: n.r_area, city: n.r_city }),
    },
    provider: { id: n.provider_id, name: n.provider_name, contact: n.provider_contact },
  };
}

async function getNotifications(req, res) {
  try {
    const userId = Number(req.params.userId);
    const [users] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.json({ success: true, notifications: [] });
    const role = users[0].role;

    const list = [];

    // ---- request notifications (built from service_requests) ----
    if (role === 'provider') {
      const [rows] = await db.query(
        `SELECT ${REQUEST_COLUMNS}, r.created_at, r.responded_at
         FROM service_requests r ${REQUEST_JOINS}
         WHERE r.provider_id = ?
           AND (r.status = 'pending' OR r.responded_at >= NOW() - INTERVAL 1 DAY)`,
        [userId]
      );
      for (const n of rows) {
        list.push({
          id: 'req-' + n.request_id, type: 'new_request', title: 'New Service Request',
          message: n.resident_name + ' wants ' + (SERVICE_LABEL[n.service] || n.service) + ' starting ' + dateOnly(n.start_date) + '.',
          createdAt: n.created_at, request: requestObject(n), deliveryId: null, note: null,
        });
      }
    } else {
      const [rows] = await db.query(
        `SELECT ${REQUEST_COLUMNS}, r.responded_at
         FROM service_requests r ${REQUEST_JOINS}
         WHERE r.resident_id = ? AND r.status IN ('accepted', 'rejected') AND r.responded_at >= NOW() - INTERVAL 1 DAY`,
        [userId]
      );
      for (const n of rows) {
        const accepted = n.req_status === 'accepted';
        const label = SERVICE_LABEL[n.service] || n.service;
        list.push({
          id: 'req-' + n.request_id, type: accepted ? 'request_accepted' : 'request_rejected',
          title: accepted ? 'Request Accepted' : 'Request Rejected',
          message: accepted
            ? n.provider_name + ' accepted your ' + label + ' request. Service starts ' + dateOnly(n.start_date) + '.'
            : n.provider_name + ' rejected your ' + label + ' request. Please choose another provider.',
          createdAt: n.responded_at, request: requestObject(n), deliveryId: null, note: null,
        });
      }
    }

    // ---- delivery notifications (built from deliveries) ----
    const DELIVERY_SQL = `
      SELECT d.id AS delivery_id, d.arrived_at, d.completed_at, d.resident_note,
       d.noted_at, d.skipped_at, d.delivery_date, ${REQUEST_COLUMNS};
      ${REQUEST_JOINS}`;

    if (role === 'resident') {
      const [rows] = await db.query(
        DELIVERY_SQL + ' WHERE s.resident_id = ? AND (d.arrived_at >= NOW() - INTERVAL 1 DAY OR d.completed_at >= NOW() - INTERVAL 1 DAY)',
        [userId]
      );
      const day = 24 * 60 * 60 * 1000;
      for (const n of rows) {
        const label = SERVICE_LABEL[n.service] || n.service;
        if (n.arrived_at && Date.now() - new Date(n.arrived_at).getTime() < day) {
          list.push({
            id: 'arr-' + n.delivery_id, type: 'provider_arrived', title: 'Provider Arrived',
            message: n.provider_name + ' has arrived for your ' + label + '.',
            createdAt: n.arrived_at, request: requestObject(n), deliveryId: n.delivery_id, note: n.resident_note || null,
          });
        }
      const [skips] = await db.query(
        DELIVERY_SQL + ' WHERE s.provider_id = ? AND d.skipped_at >= NOW() - INTERVAL 1 DAY',
        [userId]
      );
      for (const n of skips) {
        list.push({
          id: 'skip-' + n.delivery_id, type: 'service_skipped', title: 'Service Skipped',
          message: n.resident_name + ' skipped your ' + (SERVICE_LABEL[n.service] || n.service) + ' service on ' + dateOnly(n.delivery_date) + '.',
          createdAt: n.skipped_at, request: requestObject(n), deliveryId: n.delivery_id, note: null,
        });
      }

        if (n.completed_at && Date.now() - new Date(n.completed_at).getTime() < day) {
          list.push({
            id: 'done-' + n.delivery_id, type: 'service_done', title: 'Service Done',
            message: n.provider_name + ' has completed your ' + label + ' service.',
            createdAt: n.completed_at, request: requestObject(n), deliveryId: n.delivery_id, note: null,
          });
        }
      }
    } else {
      const [rows] = await db.query(
        DELIVERY_SQL + ' WHERE s.provider_id = ? AND d.resident_note IS NOT NULL AND d.noted_at >= NOW() - INTERVAL 1 DAY',
        [userId]
      );
      for (const n of rows) {
        list.push({
          id: 'note-' + n.delivery_id, type: 'resident_note', title: 'Note from Resident',
          message: n.resident_name + ' sent a note for your ' + (SERVICE_LABEL[n.service] || n.service) + ' delivery.',
          createdAt: n.noted_at, request: requestObject(n), deliveryId: n.delivery_id, note: n.resident_note,
        });
      }
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, notifications: list.slice(0, 100) });
  } catch (error) {
    console.log('getNotifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 6) GET /api/subscriptions/:role/:userId      role = resident | provider
// ------------------------------------------------------------
async function getSubscriptions(req, res) {
  try {
    const { role, userId } = req.params;
    if (role !== 'resident' && role !== 'provider') {
      return res.status(400).json({ success: false, message: 'role must be resident or provider' });
    }
    const column = role === 'resident' ? 's.resident_id' : 's.provider_id';

    const [rows] = await db.query(
      `SELECT s.*, res.name AS resident_name, res.contact AS resident_contact,
              prov.name AS provider_name, prov.contact AS provider_contact,
              ra.area AS r_area, ra.city AS r_city, ra.address AS r_address,
              ra.latitude AS r_lat, ra.longitude AS r_lng,
              pa.latitude AS p_lat, pa.longitude AS p_lng
       FROM subscriptions s
       JOIN users res  ON res.id  = s.resident_id
       JOIN users prov ON prov.id = s.provider_id
       LEFT JOIN address ra ON ra.user_id = s.resident_id
       LEFT JOIN address pa ON pa.user_id = s.provider_id
       WHERE ${column} = ?
       ORDER BY s.from_time, s.slot_index, s.id`,
      [userId]
    );

    const subscriptions = rows.map((s) => ({
      id: s.id,
      requestId: s.request_id,
      service: s.service,
      serviceLabel: SERVICE_LABEL[s.service] || s.service,
      days: s.days.split(','),
      from: s.from_time,
      to: s.to_time,
      details: s.details,
      startDate: dateOnly(s.start_date),
      monthlyRate: Number(s.monthly_rate) || 0,
      status: s.status,
      slotIndex: s.slot_index == null ? 0 : Number(s.slot_index),   // internal 10-minute place (never shown)
      resident: {
        id: s.resident_id, name: s.resident_name, contact: s.resident_contact,
        address: fullAddress({ address: s.r_address, area: s.r_area, city: s.r_city }),
        lat: s.r_lat == null ? null : Number(s.r_lat), lng: s.r_lng == null ? null : Number(s.r_lng),
      },
      provider: {
        id: s.provider_id, name: s.provider_name, contact: s.provider_contact,
        lat: s.p_lat == null ? null : Number(s.p_lat), lng: s.p_lng == null ? null : Number(s.p_lng),
      },
    }));

    res.json({ success: true, subscriptions: subscriptions });
  } catch (error) {
    console.log('getSubscriptions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// helpers for deliveries
// ------------------------------------------------------------
async function ownSubscription(subId, providerId) {
  const [rows] = await db.query('SELECT * FROM subscriptions WHERE id = ?', [subId]);
  const sub = rows[0];
  if (!sub) return { error: [404, 'Service not found'] };
  if (Number(sub.provider_id) !== Number(providerId)) return { error: [403, 'This service is not yours'] };
  return { sub: sub };
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------
// 7) POST /api/subscriptions/:id/arrive      body: { providerId, date: 'YYYY-MM-DD' }
//    Provider taps "I am arrived".
// ------------------------------------------------------------
async function markArrived(req, res) {
  try {
    const { providerId, date } = req.body;
    if (!DATE_RE.test(String(date))) return res.status(400).json({ success: false, message: 'date is required' });
    const found = await ownSubscription(Number(req.params.id), providerId);
    if (found.error) return res.status(found.error[0]).json({ success: false, message: found.error[1] });

        const [sk] = await db.query(
      'SELECT 1 FROM deliveries WHERE subscription_id = ? AND delivery_date = ? AND skipped_at IS NOT NULL',
      [found.sub.id, date]
    );
    if (sk.length > 0) return res.status(409).json
    ({ success: false, message: 'The resident skipped this service for this day' });

    await db.query(
      `INSERT INTO deliveries (subscription_id, delivery_date, arrived_at) VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE arrived_at = COALESCE(arrived_at, NOW())`,
      [found.sub.id, date]
    );
    res.json({ success: true });
  } catch (error) {
    console.log('markArrived error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 8) POST /api/subscriptions/:id/complete    body: { providerId, date }
//    Provider taps "Service done".
// ------------------------------------------------------------
async function markCompleted(req, res) {
  try {
    const { providerId, date } = req.body;
    if (!DATE_RE.test(String(date))) return res.status(400).json({ success: false, message: 'date is required' });
    const found = await ownSubscription(Number(req.params.id), providerId);
    if (found.error) return res.status(found.error[0]).json({ success: false, message: found.error[1] });

    await db.query(
      `INSERT INTO deliveries (subscription_id, delivery_date, arrived_at, completed_at) VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE arrived_at = COALESCE(arrived_at, NOW()), completed_at = COALESCE(completed_at, NOW())`,
      [found.sub.id, date]
    );
    res.json({ success: true });
  } catch (error) {
    console.log('markCompleted error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 9) POST /api/deliveries/:id/note           body: { residentId, note }
//    Resident writes an extra note on the "provider arrived" notification.
//    The provider can only VIEW it.
// ------------------------------------------------------------
async function saveDeliveryNote(req, res) {
  try {
    const deliveryId = Number(req.params.id);
    const { residentId } = req.body;
    const note = String(req.body.note || '').trim().slice(0, 500);
    if (!note) return res.status(400).json({ success: false, message: 'Write a note first' });

    const [rows] = await db.query(
      `SELECT d.*, s.resident_id FROM deliveries d JOIN subscriptions s ON s.id = d.subscription_id WHERE d.id = ?`,
      [deliveryId]
    );
    const d = rows[0];
    if (!d) return res.status(404).json({ success: false, message: 'Delivery not found' });
    if (Number(d.resident_id) !== Number(residentId)) {
      return res.status(403).json({ success: false, message: 'This delivery is not yours' });
    }
    if (d.resident_note) return res.status(409).json({ success: false, message: 'Note was already sent' });

    await db.query('UPDATE deliveries SET resident_note = ?, noted_at = NOW() WHERE id = ?', [note, deliveryId]);
    res.json({ success: true });
  } catch (error) {
    console.log('saveDeliveryNote error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 10) GET /api/deliveries/:role/:userId      role = resident | provider
//     arrived / completed state of the last 90 days (used for pending / completed / missed)
// ------------------------------------------------------------
async function getDeliveries(req, res) {
  try {
    const { role, userId } = req.params;
    if (role !== 'resident' && role !== 'provider') {
      return res.status(400).json({ success: false, message: 'role must be resident or provider' });
    }
    const column = role === 'resident' ? 's.resident_id' : 's.provider_id';
    const [rows] = await db.query(
      `SELECT d.id, d.subscription_id, DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS date,
              d.arrived_at, d.completed_at,
              CASE WHEN d.arrived_at >= NOW() - INTERVAL 1 DAY THEN d.resident_note ELSE NULL END AS note
       FROM deliveries d JOIN subscriptions s ON s.id = d.subscription_id
       WHERE ${column} = ? AND d.delivery_date >= CURDATE() - INTERVAL 90 DAY`,
      [userId]
    );
    res.json({
      success: true,
      deliveries: rows.map((d) => ({
        id: d.id, subscriptionId: d.subscription_id, date: d.date,
        arrivedAt: d.arrived_at, completedAt: d.completed_at, note: d.note || null,
      })),
    });
  } catch (error) {
    console.log('getDeliveries error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ------------------------------------------------------------
// 11) POST /api/skips     body: { residentId, items: [{ subscriptionId, date }] }
//     Resident skips services on some dates. One row per service per date in `deliveries`.
// ------------------------------------------------------------
async function skipServices(req, res) {
  try {
    const { residentId, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Select a service to skip' });
    }
    const today = dateOnly(new Date());
    for (const it of items) {
      if (!DATE_RE.test(String(it.date))) return res.status(400).json({ success: false, message: 'Wrong date' });
      if (it.date < today) return res.status(400).json({ success: false, message: 'You cannot skip a past day' });
      const [rows] = await db.query('SELECT resident_id FROM subscriptions WHERE id = ?', [it.subscriptionId]);
      if (!rows[0]) return res.status(404).json({ success: false, message: 'Service not found' });
      if (Number(rows[0].resident_id) !== Number(residentId)) {
        return res.status(403).json({ success: false, message: 'This service is not yours' });
      }
    }
    for (const it of items) {
      await db.query(
        `INSERT INTO deliveries (subscription_id, delivery_date, skipped_at) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE skipped_at = IF(completed_at IS NULL, COALESCE(skipped_at, NOW()), skipped_at)`,
        [it.subscriptionId, it.date]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.log('skipServices error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = {
 
  matchProviders, createRequest, respondToRequest,
  getNotifications, getSubscriptions,
  markArrived, markCompleted, saveDeliveryNote, getDeliveries,  skipServices,
};