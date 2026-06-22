// test/index.spec.js
import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("GET /subjects", () => {
  it("returns an array", async () => {
    const res = await SELF.fetch("http://example.com/subjects");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("write endpoints without token", () => {
  it("POST /tasks returns 403 in demo mode", async () => {
    const res = await SELF.fetch("http://example.com/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", deadline: "2026-12-01" }),
    });
    // DEMO_READONLY = "true" en el env de test → 403 antes del token check
    expect(res.status).toBe(403);
  });
});