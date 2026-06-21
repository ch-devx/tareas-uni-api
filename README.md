# uni-task-tracker-api

Cloudflare Worker that serves as a REST API for the [uni-task-tracker](https://github.com/ch-devx/uni-task-tracker) app. Connects to a Neon PostgreSQL database and exposes endpoints for managing tasks and subjects.

**Worker URL:** https://uni-tasks-worker.ch-devx.workers.dev

## Stack

- Cloudflare Workers (JavaScript)
- [@neondatabase/serverless](https://github.com/neondatabase/serverless) — Neon driver for edge environments
- Neon PostgreSQL — database

## Endpoints

### Subjects
| Method | Route | Description |
|--------|------|-------------|
| GET | `/subjects` | List all subjects |
| POST | `/subjects` | Create subject |
| PUT | `/subjects/:id` | Edit subject |
| DELETE | `/subjects/:id` | Delete subject |

### Tasks
| Method | Route | Description |
|--------|------|-------------|
| GET | `/tasks` | List pending tasks (sorted by deadline) |
| GET | `/tasks/done` | List completed tasks |
| POST | `/tasks` | Create task |
| PUT | `/tasks/:id` | Edit task |
| PATCH | `/tasks/:id/toggle` | Toggle pending/done status |
| DELETE | `/tasks/:id` | Delete task |

## Structure
uni-task-tracker-api/

├── src/

│   └── index.js       # Full Worker logic

├── wrangler.jsonc     # Cloudflare configuration

└── package.json

## Setup

### 1. Requirements

- [Node.js](https://nodejs.org/) LTS
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- Cloudflare account ([cloudflare.com](https://cloudflare.com))
- Database on [Neon](https://neon.tech)

### 2. Clone and install dependencies

```bash
git clone https://github.com/ch-devx/uni-task-tracker-api.git
cd uni-task-tracker-api
npm install
```

### 3. Authenticate with Cloudflare

```bash
wrangler login
```

### 4. Set up the database secret

```bash
wrangler secret put DATABASE_URL
# Paste the Neon connection string when prompted
# Format: postgresql://user:password@host/dbname?sslmode=require
```

### 5. Deploy

```bash
npm run deploy
```

## Local development

```bash
npm run dev
```

The Worker runs at `http://localhost:8787`. For it to work locally you need a `.dev.vars` file in the root with:
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

## Database

The schema lives in Neon. The tables were originally created from the Python project using SQLAlchemy. If you need to recreate them:

```sql
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#6c757d',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    deadline DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```