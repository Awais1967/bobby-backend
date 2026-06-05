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
- `POST /api/auth/forgot-password`
- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`

Password recovery supports Super Admin and Host accounts. OTPs and reset tokens are stored as hashes with short expiries. Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and `EMAIL_FROM` for delivery. For local authenticated-flow testing without SMTP, set `PASSWORD_RESET_EXPOSE_OTP=true` only while `NODE_ENV` is not `production`; the forgot/resend response will then include `data.devOtp`.

### Seed First Super Admin

Set these values in `.env`, then run the seed command:

```bash
SUPER_ADMIN_NAME=Trivia Goat Super Admin
SUPER_ADMIN_EMAIL=admin@triviagoat.com
SUPER_ADMIN_PASSWORD=change-this-password

npm run seed:admin
```

## Host Management

Module 2 lets Super Admins manage Host accounts. Host users can log in, but they cannot access these management APIs. Archived hosts are hidden from normal host lists by default, cannot log in, and cannot run matches. Hosts with match history are archived instead of hard-deleted so old match, billing, report, and calendar references remain intact.

### Endpoints

- `POST /api/hosts`
- `GET /api/hosts`
- `GET /api/hosts/:id`
- `PUT /api/hosts/:id`
- `PATCH /api/hosts/:id/password`
- `PATCH /api/hosts/:id/status`
- `PATCH /api/hosts/:id/archive`
- `PATCH /api/hosts/:id/restore`
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

## Clients

Clients use the existing `Location` model and `locations` collection. The `/api/clients` routes are the admin-facing client API for creating and managing venues, logo upload, host assignment, billing method, and archive/restore workflows. Logo files are uploaded in the same multipart request and only `logoUrl` is stored. Raw card numbers and CVV are rejected; card billing expects a Stripe payment method token and stores only Stripe references plus masked card metadata.

### Client Endpoints

- `POST /api/clients`
- `GET /api/clients`
- `GET /api/clients/my`
- `GET /api/clients/:id`
- `PUT /api/clients/:id`
- `PATCH /api/clients/:id/billing-method`
- `PATCH /api/clients/:id/archive`
- `PATCH /api/clients/:id/restore`
- `PATCH /api/clients/:id/hosts`
- `DELETE /api/clients/:id`

## Question Bank Media Uploads

Question create and update requests support `multipart/form-data` so Super Admins can upload image/audio media in the same request. Uploaded question files are stored through the internal upload service using S3 when configured, or local `/uploads` storage in development. The Question document stores only `imageUrl` and `audioUrl`; there is no separate public upload API module.

### Question Media Endpoints

- `POST /api/questions` with optional `image` and `audio` file fields
- `PUT /api/questions/:id` with optional replacement `image` and `audio` file fields

## Live Match Management

Module 6 manages live match setup and host-paced lifecycle controls. Hosts create matches from an assigned active location and an available active/scheduled game template. Match setup generates a Match ID, Entry Code, join URL, and QR code data URL. Player join, answer submission, scoring, leaderboard updates, and Stripe charging are intentionally deferred.

Matches copy the source game's `scheduledDate` into `scheduledAt` when created. `scheduledAt` is used for upcoming calendar placement, while `startedAt` remains the actual live start time.

### Endpoints

- `POST /api/matches`
- `GET /api/matches`
- `GET /api/matches/active`
- `GET /api/matches/public/:matchId`
- `GET /api/matches/:id`
- `PATCH /api/matches/:id/confirm`
- `PATCH /api/matches/:id/start`
- `PATCH /api/matches/:id/question/open`
- `PATCH /api/matches/:id/question/close`
- `PATCH /api/matches/:id/question/next`
- `PATCH /api/matches/:id/question/jump`
- `PATCH /api/matches/:id/question/skip`
- `PATCH /api/matches/:id/intermission/start`
- `PATCH /api/matches/:id/intermission/end`
- `PATCH /api/matches/:id/close`
- `PATCH /api/matches/:id/end`
- `PATCH /api/matches/:id/cancel`

## Player Join / Team Management

Module 7 lets players join matches without accounts by using Match ID, Entry Code, Team Name, a 4-digit security code, and a device ID. Team security codes are hashed, player sessions use separate player JWT payloads, and host team management is limited to the assigned host for that match.

### Player Endpoints

- `POST /api/player/join`
- `POST /api/player/reconnect`
- `POST /api/player/switch-device/confirm`
- `GET /api/player/session`
- `PATCH /api/player/leave`
- `GET /api/player/match/:matchId`

### Host Team Endpoints

- `GET /api/matches/:id/teams`
- `PATCH /api/matches/:id/teams/:teamId/remove`
- `PATCH /api/matches/:id/teams/:teamId/restore`

## Answer Submission

Module 8 lets active teams submit one locked answer for the currently open question. Answers are accepted only from the team's active device while the match is live and `question_open`. Hosts can view submissions and reopen an answer for resubmission, but grading, scoring, leaderboard updates, and answer key exposure are not included.

### Player Answer Endpoints

- `POST /api/player/answers`
- `GET /api/player/answers/current`
- `GET /api/player/answers`

### Host Answer Endpoints

- `GET /api/matches/:id/answers/current`
- `GET /api/matches/:id/questions/:questionId/answers`
- `PATCH /api/matches/:id/answers/:answerId/reopen`

## Answer Review / Scoring

Module 9 lets the assigned Host review answers, award points, manually adjust scores, and produce score logs. Team ranks are recalculated after score changes. Super Admins can view match scores, but live scoring actions are Host-only.

### Scoring Endpoints

- `PATCH /api/matches/:id/answers/:answerId/review`
- `PATCH /api/matches/:id/answers/review-bulk`
- `POST /api/matches/:id/questions/:questionId/auto-grade`
- `PATCH /api/matches/:id/teams/:teamId/score/add`
- `PATCH /api/matches/:id/teams/:teamId/score/deduct`
- `PATCH /api/matches/:id/teams/:teamId/score/override`
- `GET /api/matches/:id/score-logs`
- `GET /api/matches/:id/scores`

## Real-Time Leaderboard / State APIs

Module 10 exposes safe leaderboard and match-state APIs for players, hosts, and presentation screens. Socket.IO rooms keep match, team, and presentation clients synchronized without exposing answer keys, billing data, security codes, or private device/session data.

### Leaderboard And State Endpoints

- `GET /api/leaderboard/player`
- `GET /api/leaderboard/match/:matchId`
- `GET /api/leaderboard/host/matches/:id`
- `GET /api/player/state`
- `GET /api/matches/public/:matchId/state`

### Socket Rooms And Events

- Rooms: `match:{matchId}`, `host:{hostId}`, `team:{teamId}`, `presentation:{matchId}`
- Client events: `join_match_room`, `join_team_room`, `join_presentation_room`, `leave_room`, `request_leaderboard`, `request_match_state`
- Server events: `leaderboard_updated`, `match_state_updated`, `question_state_updated`, `team_score_updated`, `answer_submitted`, `answer_reviewed`, `intermission_started`, `intermission_ended`, `match_closed`, `match_ended`

## Billing / Close-Match Charge

Module 11 ties billing to the Location/Client when a Host closes a match. `auto_charge` matches charge the Stripe customer/payment method on file with an idempotency key, while `invoice_later` matches create an unpaid transaction for Super Admin reconciliation. Raw card data is never stored.

### Billing Endpoints

- `GET /api/billing/summary`
- `GET /api/billing/transactions`
- `GET /api/billing/transactions/:id`
- `POST /api/billing/transactions/:id/retry`
- `PATCH /api/billing/transactions/:id/mark-paid`
- `PATCH /api/billing/transactions/:id/cancel`
- `POST /api/billing/webhook`

## Reporting / Analytics / Export

Module 12 gives Super Admins platform-wide operational reporting. Match reports are generated from Match snapshots plus Team and Transaction data, while billing reports use Transaction as the billing source of truth. Exports use CSV and Excel formats and intentionally exclude player security codes, session tokens, active device IDs, and raw Stripe details.

### Report Endpoints

- `GET /api/reports/summary`
- `GET /api/reports/revenue`
- `GET /api/reports/teams`
- `GET /api/reports/matches`
- `GET /api/reports/matches/export/csv`
- `GET /api/reports/matches/export/excel`
- `GET /api/reports/matches/:matchId`
- `GET /api/reports/billing`
- `GET /api/reports/billing/export/csv`
- `GET /api/reports/billing/export/excel`
- `GET /api/reports/hosts`
- `GET /api/reports/locations`

Match report details include per-team `totalResponses`, `correctResponses`, `incorrectResponses`, and `unansweredCount`.

## Calendar

`GET /api/calendar/range` and `GET /api/calendar/day` accept `eventCategory=game|match` to filter the combined event response. Match calendar dates use `scheduledAt`, falling back to `startedAt` for older records without a schedule.

## Authenticated Runtime Testing

1. Configure `MONGODB_URI`, `JWT_SECRET`, and the frontend/backend URL variables in `.env`.
2. Set `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD`.
3. Run `npm run seed:admin`.
4. Configure SMTP, or enable the development-only `PASSWORD_RESET_EXPOSE_OTP=true` switch.

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
