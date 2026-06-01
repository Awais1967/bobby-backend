# Trivia Goat Backend

Initial Node.js backend for Trivia Goat, built with Express.js, MongoDB/Mongoose, JWT auth, Socket.IO, Stripe, and AWS S3 upload support.

## Roles

- Super Admin: manages games, locations, billing, reports, hosts, and questions.
- Host: logs in with email/password and controls live trivia matches.
- Player: joins live matches without creating an account.

## Real-Time Scope

Socket.IO is included for live match state, answer submission, leaderboard updates, and host controls.

## Getting Started

```bash
cp .env.example .env
npm run dev
```

## Scripts

- `npm run dev`: starts the API with nodemon.
- `npm start`: starts the API with Node.js.
- `npm run seed:admin`: creates the first Super Admin from environment variables.

## Auth Module

Module 1 supports email/password authentication for Super Admins and Hosts only.
Players are represented by the `player` role constant, but they do not create accounts or log in through this module.

### Endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`

### Seed First Super Admin

Set these values in `.env`, then run the seed command:

```bash
SUPER_ADMIN_NAME=Trivia Goat Super Admin
SUPER_ADMIN_EMAIL=admin@triviagoat.com
SUPER_ADMIN_PASSWORD=change-this-password

npm run seed:admin
```

## Host Management

Module 2 lets Super Admins manage Host accounts. Host users can log in, but they cannot access these management APIs.

### Endpoints

- `POST /api/hosts`
- `GET /api/hosts`
- `GET /api/hosts/:id`
- `PUT /api/hosts/:id`
- `PATCH /api/hosts/:id/password`
- `PATCH /api/hosts/:id/status`
- `DELETE /api/hosts/:id`

## Location Management

Module 3 manages Locations/Clients. Super Admins can create and maintain location records, billing setup fields, promotional display fields, and host assignments. Hosts can only fetch their own assigned active locations through the host route.

### Endpoints

- `POST /api/locations`
- `GET /api/locations`
- `GET /api/locations/my`
- `GET /api/locations/:id`
- `PUT /api/locations/:id`
- `PATCH /api/locations/:id/status`
- `PATCH /api/locations/:id/hosts`
- `DELETE /api/locations/:id`

## Project Structure

```text
src/
  config/
  constants/
  middleware/
  utils/
  modules/
    auth/
    admins/
    hosts/
    locations/
    games/
    questions/
    matches/
    player/
    leaderboard/
    billing/
    reports/
    calendar/
    promotions/
    uploads/
  sockets/
  routes/
```
