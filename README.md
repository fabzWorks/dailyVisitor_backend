# Daily Visitor - Backend (Node.js + Express + MySQL)

## Folder structure
backend/
  server.js                      -> server start yahan se hota hai
  db.js                          -> MySQL connection
  database.sql                   -> tables ki saari queries (MySQL main copy-paste karke run karein)
  resident/                      -> sirf RESIDENT ka code
    resident.routes.js
    resident.controller.js
  service_request/               -> subscribe flow: match, request, accept/reject, notifications, schedule
    request.routes.js
    request.controller.js
  service_provider/              -> sirf SERVICE PROVIDER ka code
    provider.routes.js
    provider.controller.js

## Run karne ke steps
1. MySQL main `database.sql` ka poora code copy karke run karein (6 tables banengi, koi dummy data nahi).
2. `.env.example` ki copy bana kar naam `.env` rakhein, aur apna MySQL password dalein.
3. Terminal main:  npm install
4. Phir:           npm start
5. Browser main kholein: http://localhost:4000/api/health

## API list
POST /api/resident/signup
POST /api/resident/login
POST /api/provider/signup
POST /api/provider/login
POST /api/requests/match            (requirement ke exact match providers)
POST /api/requests                  (provider ko request + notification)
POST /api/requests/:id/respond      (provider: accept / reject)
GET  /api/notifications/:userId     (notification bar)
POST /api/notifications/:userId/read
GET  /api/subscriptions/:role/:userId   (resident / provider schedule)

## Database tables
users            -> resident aur provider dono (role column se pata chalta hai)
address          -> sab users ka address
provider_service -> provider ki service ki detail (products, days aur time slots isi main)
                    days = "Mon,Tue,Wed" ; time_slots sab selected dino par lagte hain
service_requests -> resident ki bheji hui request (pending / accepted / rejected)
notifications    -> resident aur provider ki notifications
subscriptions    -> accept hui requests (dono ke schedule main dikhti hain)
