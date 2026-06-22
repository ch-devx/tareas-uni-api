import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("GET /subjects", () => {
  it("returns 200 or 500 (never 401/403)", async () => {
    const res = await SELF.fetch("http://example.com/subjects");
    expect([200, 500]).toContain(res.status);
  });
});

describe("write endpoints without token", () => {
  it("POST /tasks returns 403 in demo mode", async () => {
    const res = await SELF.fetch("http://example.com/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", deadline: "2026-12-01" }),
    });
    expect(res.status).toBe(403);
  });
});