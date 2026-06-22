import { neon } from "@neondatabase/serverless";

// ── CORS headers ─────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

// ── Auth ─────────────────────────────────────────────────────
// Constant-time string comparison to avoid timing attacks on the token check.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function isAuthorized(request, env) {
  if (!env.API_TOKEN) return false; // fail closed if the secret isn't configured
  const header = request.headers.get("Authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  return timingSafeEqual(token, env.API_TOKEN);
}

// ── Router ───────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const method = request.method;
    const isWrite = method !== "GET";

    // ── Demo read-only guard ────────────────────────────────
    // Set DEMO_READONLY = "true" as a var in wrangler.jsonc to lock writes.
    if (env.DEMO_READONLY === "true" && isWrite) {
      return json(
        { error: "This is a read-only demo. Write operations are disabled." },
        403
      );
    }

    // ── Token guard ──────────────────────────────────────────
    // Every write operation (POST/PUT/PATCH/DELETE) requires a valid
    // Authorization: Bearer <API_TOKEN> header. This is independent of
    // DEMO_READONLY: even if the demo flag is ever turned off, writes
    // still require the secret token. GET requests are never gated here.
    if (isWrite && !isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const sql = neon(env.DATABASE_URL);
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── Subjects ──────────────────────────────────────────

      // GET /subjects
      if (path === "/subjects" && method === "GET") {
        const rows = await sql`
          SELECT * FROM subjects ORDER BY name ASC
        `;
        return json(rows);
      }

      // POST /subjects
      if (path === "/subjects" && method === "POST") {
        const { name, color = "#6c757d" } = await request.json();
        if (!name) return error("The name is required");
        const existing = await sql`
          SELECT id FROM subjects WHERE name = ${name}
        `;
        if (existing.length > 0) return error("A subject with that name already exists");
        const [row] = await sql`
          INSERT INTO subjects (name, color)
          VALUES (${name}, ${color})
          RETURNING *
        `;
        return json(row, 201);
      }

      // PUT /subjects/:id
      const subjectMatch = path.match(/^\/subjects\/(\d+)$/);
      if (subjectMatch && method === "PUT") {
        const id = parseInt(subjectMatch[1]);
        const { name, color } = await request.json();
        const [row] = await sql`
          UPDATE subjects SET name = ${name}, color = ${color}
          WHERE id = ${id} RETURNING *
        `;
        if (!row) return error("Subject not found", 404);
        return json(row);
      }

      // DELETE /subjects/:id
      if (subjectMatch && method === "DELETE") {
        const id = parseInt(subjectMatch[1]);
        await sql`DELETE FROM subjects WHERE id = ${id}`;
        return json({ message: "Subject deleted" });
      }

      // ── Tasks ─────────────────────────────────────────────

      // GET /tasks
      if (path === "/tasks" && method === "GET") {
        const rows = await sql`
          SELECT t.*, 
                 s.name as subject_name, 
                 s.color as subject_color
          FROM tasks t
          LEFT JOIN subjects s ON t.subject_id = s.id
          WHERE t.status = 'pending'
          ORDER BY t.deadline ASC
        `;
        return json(rows);
      }

      // GET /tasks/done
      if (path === "/tasks/done" && method === "GET") {
        const rows = await sql`
          SELECT t.*, 
                 s.name as subject_name, 
                 s.color as subject_color
          FROM tasks t
          LEFT JOIN subjects s ON t.subject_id = s.id
          WHERE t.status = 'done'
          ORDER BY t.deadline DESC
        `;
        return json(rows);
      }

      // POST /tasks
      if (path === "/tasks" && method === "POST") {
        const { title, description = null, subject_id = null, deadline, status = "pending" } = await request.json();
        if (!title) return error("The title is required");
        if (!deadline) return error("The deadline is required");
        const [row] = await sql`
          INSERT INTO tasks (title, description, subject_id, deadline, status)
          VALUES (${title}, ${description}, ${subject_id}, ${deadline}, ${status})
          RETURNING *
        `;
        return json(row, 201);
      }

      // PUT /tasks/:id
      const taskMatch = path.match(/^\/tasks\/(\d+)$/);
      if (taskMatch && method === "PUT") {
        const id = parseInt(taskMatch[1]);
        const { title, description = null, subject_id = null, deadline, status } = await request.json();
        const [row] = await sql`
          UPDATE tasks
          SET title = ${title},
              description = ${description},
              subject_id = ${subject_id},
              deadline = ${deadline},
              status = ${status}
          WHERE id = ${id} RETURNING *
        `;
        if (!row) return error("Task not found", 404);
        return json(row);
      }

      // PATCH /tasks/:id/toggle
      const toggleMatch = path.match(/^\/tasks\/(\d+)\/toggle$/);
      if (toggleMatch && method === "PATCH") {
        const id = parseInt(toggleMatch[1]);
        const [current] = await sql`SELECT status FROM tasks WHERE id = ${id}`;
        if (!current) return error("Task not found", 404);
        const newStatus = current.status === "pending" ? "done" : "pending";
        const [row] = await sql`
          UPDATE tasks SET status = ${newStatus}
          WHERE id = ${id} RETURNING *
        `;
        return json(row);
      }

      // DELETE /tasks/:id
      if (taskMatch && method === "DELETE") {
        const id = parseInt(taskMatch[1]);
        await sql`DELETE FROM tasks WHERE id = ${id}`;
        return json({ message: "Task deleted" });
      }

      // ── 404 ───────────────────────────────────────────────
      return error("Route not found", 404);

    } catch (err) {
      console.error(err);
      return error("Internal server error", 500);
    }
  },
  async scheduled(event, env, ctx) {
    const sql = neon(env.DATABASE_URL);
    try {
      await sql`
        UPDATE tasks t
        SET deadline = CURRENT_DATE + (ds.offset_days || ' days')::INTERVAL
        FROM demo_seed ds
        WHERE t.id = ds.task_id
      `;
      console.log("Demo deadlines refreshed");
    } catch (err) {
      console.error("Failed to refresh demo deadlines", err);
    }
  },
};