import { SELF } from "cloudflare:test";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @neondatabase/serverless ────────────────────────────
// Interceptamos neon() antes de que el Worker lo use.
// Cada test puede sobreescribir el comportamiento con mockResolvedValueOnce.
const mockSql = vi.fn();

vi.mock("@neondatabase/serverless", () => ({
	neon: () => mockSql,
}));

// ── Helpers ──────────────────────────────────────────────────
function req(path, options = {}) {
	return SELF.fetch(`http://example.com${path}`, options);
}

function writeReq(method, path, body) {
	return req(path, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function authedReq(method, path, body) {
	return req(path, {
		method,
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer test-token",
		},
		body: JSON.stringify(body),
	});
}

// ── Subjects ─────────────────────────────────────────────────
describe("GET /subjects", () => {
	it("returns 200 and an array", async () => {
		mockSql.mockResolvedValueOnce([
			{ id: 1, name: "Databases", color: "#5b8dd9" },
			{ id: 2, name: "Algorithms", color: "#4caf82" },
		]);

		const res = await req("/subjects");
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data).toHaveLength(2);
		expect(data[0]).toMatchObject({ id: 1, name: "Databases" });
	});

	it("returns an empty array when there are no subjects", async () => {
		mockSql.mockResolvedValueOnce([]);

		const res = await req("/subjects");
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(data).toEqual([]);
	});
});

// ── Tasks ─────────────────────────────────────────────────────
describe("GET /tasks", () => {
	it("returns 200 and pending tasks sorted by deadline", async () => {
		mockSql.mockResolvedValueOnce([
			{ id: 1, title: "Midterm", deadline: "2026-07-10", status: "pending", subject_name: "Databases", subject_color: "#5b8dd9" },
			{ id: 2, title: "Final project", deadline: "2026-07-20", status: "pending", subject_name: null, subject_color: null },
		]);

		const res = await req("/tasks");
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data[0].status).toBe("pending");
	});
});

describe("GET /tasks/done", () => {
	it("returns 200 and completed tasks", async () => {
		mockSql.mockResolvedValueOnce([
			{ id: 3, title: "Lab report", deadline: "2026-06-01", status: "done", subject_name: "Chemistry", subject_color: "#d97b5b" },
		]);

		const res = await req("/tasks/done");
		expect(res.status).toBe(200);

		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data[0].status).toBe("done");
	});
});

// ── Demo read-only mode ───────────────────────────────────────
// DEMO_READONLY = "true" está configurado en wrangler.jsonc.
// Todos los writes deben devolver 403 antes de llegar al token check.
describe("write operations in demo mode", () => {
	it("POST /tasks returns 403", async () => {
		const res = await writeReq("POST", "/tasks", { title: "Test task", deadline: "2026-12-01" });
		expect(res.status).toBe(403);

		const data = await res.json();
		expect(data.error).toMatch(/read-only/i);
	});

	it("POST /subjects returns 403", async () => {
		const res = await writeReq("POST", "/subjects", { name: "Physics", color: "#5b8dd9" });
		expect(res.status).toBe(403);
	});

	it("PUT /tasks/:id returns 403", async () => {
		const res = await writeReq("PUT", "/tasks/1", { title: "Updated", deadline: "2026-12-01", status: "pending" });
		expect(res.status).toBe(403);
	});

	it("DELETE /tasks/:id returns 403", async () => {
		const res = await req("/tasks/1", { method: "DELETE" });
		expect(res.status).toBe(403);
	});

	it("PATCH /tasks/:id/toggle returns 403", async () => {
		const res = await req("/tasks/1/toggle", { method: "PATCH" });
		expect(res.status).toBe(403);
	});
});

// ── CORS ─────────────────────────────────────────────────────
describe("CORS preflight", () => {
	it("OPTIONS returns 200 with CORS headers", async () => {
		const res = await req("/tasks", { method: "OPTIONS" });
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
	});
});

// ── 404 ──────────────────────────────────────────────────────
describe("unknown routes", () => {
	it("GET /unknown returns 404", async () => {
		mockSql.mockResolvedValueOnce([]);

		const res = await req("/unknown-route");
		expect(res.status).toBe(404);
	});
});

// ── Auth token guard ──────────────────────────────────────────
describe("token guard — write without token", () => {
	it("POST /tasks without token is blocked (403 demo mode, 401 otherwise)", async () => {
		const res = await writeReq("POST", "/tasks", { title: "Test", deadline: "2026-12-01" });
		expect([401, 403]).toContain(res.status);
	});
});

describe("Authorization header — forwarded correctly", () => {
	it("request with Bearer token still returns 403 in demo mode (DEMO_READONLY=true)", async () => {
		const res = await authedReq("POST", "/tasks", { title: "Test", deadline: "2026-12-01" });
		expect(res.status).toBe(403); // demo mode fires before token check
	});
});