# Daily Visitor - Backend (Node.js + Express + MySQL + Sequelize ORM)

Koi raw SQL query nahi hai. Sab kuch Sequelize models se hota hai.

## Folder structure
```
server.js                 -> DB banata hai, tables sync karta hai, server start karta hai
config/database.js        -> Sequelize connection
models/                   -> tables (har file = aik table). index.js sab ko khud load karta hai
  User.js                 -> users            (resident + provider, role column)
  Address.js              -> address          (har user ka address + lat/lng)
  ProviderService.js      -> provider_service (service, rates, days, time slots)
  ServiceRequest.js       -> service_requests (pending / accepted / rejected)
  Subscription.js         -> subscriptions    (accept hui request ka schedule)
  Delivery.js             -> deliveries       (arrived / completed / skipped / note)
controllers/              -> logic
  authController.js, requestController.js, notificationController.js,
  subscriptionController.js, deliveryController.js
routes/                   -> URLs. File ka naam hi URL banta hai (authRoutes.js -> /api/auth)
utils/                    -> helpers.js, pricing.js, matching.js, providerQuery.js, deliveryHelpers.js
```

## Run
1. `npm install`
2. `.env` kholein aur MySQL Workbench wali connection ke hisaab se bharein:
   `DB_HOST`, `DB_PORT` (Workbench main jo port hai, aam taur par 3306), `DB_USER`, `DB_PASSWORD`
   (password main `#` `$` jaise symbols hon to single quotes lagayein: `DB_PASSWORD='abc#123'`)
3. `npm start`  -> database (`DB_NAME`) aur saari 6 tables khud ban jati hain, SQL chalane ki zaroorat nahi
4. Workbench main Schemas ke paas refresh dabayein, database aur tables nazar aa jayengi
5. http://localhost:4000/api/health

Connection error aaye to terminal main "👉" wali line wajah bata degi (MySQL band hai / password galat / auth mode).

## Postman se test
1. Postman -> Import -> `postman/DailyVisitor.postman_collection.json`
2. Collection par right click -> **Run collection** -> Run. Saari 31 requests ek hi baar main chal jayengi
   (emails, ids, tareekhen sab khud ban/save ho jati hain, kuch hath se likhna nahi).
3. Server doosre port par ho to collection variable `baseUrl` badal dein.
Har request main tests likhe hain (green tick = theek).

Model (column) badalne ke baad ek baar `DB_ALTER=true npm start` chalayein, phir normal `npm start`.

## API list
| Method | URL | Kaam |
|---|---|---|
| POST | /api/auth/login | login (resident + provider) |
| POST | /api/auth/signup/resident | resident signup |
| POST | /api/auth/signup/provider | provider signup |
| POST | /api/requests/match | requirement ke exact match providers |
| POST | /api/requests | provider ko request bhejna |
| POST | /api/requests/:id/respond | provider accept / reject |
| GET  | /api/notifications/:userId | notification bar (24 ghante) |
| GET  | /api/subscriptions/:role/:userId | resident / provider schedule |
| POST | /api/subscriptions/:id/arrive | provider "I am arrived" |
| POST | /api/subscriptions/:id/complete | provider "Service done" |
| GET  | /api/deliveries/:role/:userId | pichle 90 din ki delivery state |
| POST | /api/deliveries/:id/note | resident ka note |
| POST | /api/skips | resident service skip kare |
