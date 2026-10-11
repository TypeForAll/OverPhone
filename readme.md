# OverPhone

OverPhone is a full-stack internet calling and messaging PWA. It only routes calls between OverPhone accounts over WebRTC; it does not and cannot place calls on the cellular/PSTN network. A SIP/PSTN provider can be added behind the call service later.

## Architecture

- `frontend`: React + Vite installable PWA, Socket.IO client, WebRTC audio peer connection.
- `backend`: Express REST API + Socket.IO authenticated signaling/presence.
- PostgreSQL + Prisma: durable accounts, country-code-prefixed 12-digit OverPhone numbers, contacts, messages, call records, blocks, subscriptions, and sessions.
- Web Push: browser/OS notifications. coturn: production TURN relay.

## Run locally

1. Copy `.env.example` to `.env`, use a strong 32+ byte `SESSION_SECRET`, and set `CLIENT_ORIGIN=http://localhost:5173`.
2. Start Postgres with `docker compose up -d postgres`.
3. `npm install`, then `npm run db:generate`, then `npm run db:migrate`.
4. Seed countries using `npm run prisma:seed -w backend` (or insert your supported country policy in the `countries` table).
5. Start with `npm run dev`. Registration only needs a username, email, password, and selected country—no real phone number.

For PWA testing, use HTTPS (localhost is treated as secure by browsers). Build with `npm run build`.

Run `npm test` with a dedicated migrated test database (`DATABASE_URL` must contain `test`). The concurrency integration test sends simultaneous claims and asserts that PostgreSQL's unique E.164 constraint admits only one.

## Required production services

PostgreSQL, a Node host that supports long-lived WebSocket connections, HTTPS/TLS, VAPID keys for Web Push, and **coturn**. Configure `TURN_SERVER_URL`, `TURN_USERNAME`, and `TURN_PASSWORD` on the backend; never put static TURN credentials in the frontend. For serious production traffic use a TURN credential service with time-limited credentials.

Set `CLIENT_ORIGIN` to the exact HTTPS app origin, mark cookies secure (automatic when `NODE_ENV=production`), run `npx prisma migrate deploy`, and host the built frontend behind the included SPA nginx pattern. Scale Socket.IO with a Redis adapter when using more than one backend instance.

## Privacy and limitations

OverPhone does not collect real phone numbers. Every account receives an identifier made of its country calling code plus exactly 12 OverPhone digits. Passwords use Argon2id; sessions are random opaque secure cookies stored as hashes. Every REST route and Socket.IO event checks identity and conversation/call membership. Push notifications can alert about calls/messages, but browsers and mobile operating systems may throttle background execution; an installed PWA cannot guarantee that it wakes in time to answer a call. Calls and live messages require connectivity.
