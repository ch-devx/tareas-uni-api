# uni-task-tracker-api

REST API for the [Uni Task Tracker](https://github.com/ch-devx/uni-task-tracker) web app — a university task manager with subject organization, deadline tracking, and urgency indicators.

Built as a **Cloudflare Worker** connected to a **Neon serverless PostgreSQL** database. Deployed at the edge with zero cold starts.

**Live demo:** [uni-task-tracker](https://ch-devx.github.io/uni-task-tracker/) · **Worker URL:** `https://uni-tasks-worker.ch-devx.workers.dev`

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (V8 isolates, edge-deployed) |
| Database | Neon serverless PostgreSQL |
| DB driver | [@neondatabase/serverless](https://github.com/neondatabase/serverless) — WebSocket-based, edge-compatible |
| Deploy & config | Wrangler CLI |
| Tests | Vitest + `@cloudflare/vitest-pool-workers` |

---

## Architecture decisions

**Why Cloudflare Workers?** Workers run on V8 isolates at the edge — no servers to manage, no cold starts, and global low latency. This makes them a natural fit for a lightweight API that serves a static frontend on GitHub Pages.

**Why Neon?** Standard PostgreSQL drivers use TCP connections, which don't work in edge runtimes. Neon's serverless driver communicates over HTTP/WebSocket, making it compatible with the Workers environment while keeping the full power of SQL.

**Security model:** the public demo is read-only by design. Two independent layers enforce this:
1. `DEMO_READONLY` environment variable — rejects any write request with `403` at the application level.
2. `API_TOKEN` secret — all write operations (`POST`, `PUT`, `PATCH`, `DELETE`) require `Authorization: Bearer <token>`, validated with constant-time comparison to prevent timing attacks. GET endpoints remain fully public.

This means even if the demo flag is toggled off, writes still require the token. The token is never exposed in the frontend.

---

## API reference

### Subjects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/subjects` | List all subjects |
| `POST` | `/subjects` | Create a subject |
| `PUT` | `/subjects/:id` | Update a subject |
| `DELETE` | `/subjects/:id` | Delete a subject |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tasks` | List pending tasks, sorted by deadline |
| `GET` | `/tasks/done` | List completed tasks |
| `POST` | `/tasks` | Create a task |
| `PUT` | `/tasks/:id` | Update a task |
| `PATCH` | `/tasks/:id/toggle` | Toggle pending ↔ done |
| `DELETE` | `/tasks/:id` | Delete a task |

### Authentication

GET requests are public. All write operations require a Bearer token:

```
Authorization: Bearer <API_TOKEN>
```

Example:
```bash
curl -X POST https://uni-tasks-worker.ch-devx.workers.dev/tasks \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Final exam prep", "deadline": "2026-07-15", "subject_id": 2}'
```

Requests without a valid token return `401 Unauthorized`. The token is stored as a Wrangler secret and never committed to the repository.

---

## Project structure

```
uni-task-tracker-api/
├── src/
│   └── index.js        # All Worker logic: routing, auth, DB queries
├── test/
│   └── index.spec.js   # Vitest tests (Workers pool)
├── wrangler.jsonc       # Cloudflare configuration
├── vitest.config.js     # Test configuration
└── package.json
```

---

## Local setup

### Requirements

- Node.js 20+
- A [Cloudflare account](https://cloudflare.com) (free tier works)
- A [Neon](https://neon.tech) PostgreSQL database

### Steps

```bash
# 1. Clone and install
git clone https://github.com/ch-devx/uni-task-tracker-api.git
cd uni-task-tracker-api
npm install

# 2. Authenticate with Cloudflare
npx wrangler login

# 3. Set secrets
npx wrangler secret put DATABASE_URL
# Paste your Neon connection string:
# postgresql://user:password@host/dbname?sslmode=require

npx wrangler secret put API_TOKEN
# Paste a random token (generate one with: openssl rand -hex 32)

# 4. Run locally
npm run dev
# Worker available at http://localhost:8787

# 5. Deploy
npm run deploy

# 6. Run tests
npm test
```

For local development, create a `.dev.vars` file in the project root (gitignored):

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
API_TOKEN=your-local-dev-token
```

---

## Database schema

```sql
CREATE TABLE subjects (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) UNIQUE NOT NULL,
    color      VARCHAR(7) NOT NULL DEFAULT '#6c757d',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    subject_id  INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    deadline    DATE NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Demo data refresh

A Cron Trigger runs daily at 06:00 UTC. It shifts task deadlines in the demo database relative to the current date, so the urgency indicators in the live demo always reflect realistic upcoming deadlines rather than stale past dates.

```jsonc
// wrangler.jsonc
"triggers": {
  "crons": ["0 6 * * *"]
}
```