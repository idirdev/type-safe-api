import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { Client, ApiError } from "../src/Client";

const mockSchema = {
  getUser: {
    method: "GET" as const,
    path: "/users/:id",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
  },
  createUser: {
    method: "POST" as const,
    path: "/users",
    input: z.object({ name: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
  },
};

describe("Client", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(data: unknown, success = true) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => success
        ? { success: true, data }
        : { success: false, error: data },
    });
  }

  it("creates a client with base URL", () => {
    const client = new Client(mockSchema, { baseURL: "http://localhost:3000" });
    expect(client).toBeDefined();
  });

  it("strips trailing slash from base URL", () => {
    const client = new Client(mockSchema, { baseURL: "http://localhost:3000/" });
    mockFetch({ id: "1", name: "Alice" });

    // this would fail if trailing slash not stripped (double slash in URL)
    client.api.getUser({ id: "1" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/1"),
      expect.any(Object),
    );
  });

  it("makes GET request with path params", async () => {
    mockFetch({ id: "42", name: "Alice" });
    const client = new Client(mockSchema, { baseURL: "http://localhost:3000" });

    const result = await client.api.getUser({ id: "42" });
    expect(result).toEqual({ id: "42", name: "Alice" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/42"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("makes POST request with body", async () => {
    mockFetch({ id: "new", name: "Bob" });
    const client = new Client(mockSchema, { baseURL: "http://localhost:3000" });

    const result = await client.api.createUser({ name: "Bob" });
    expect(result).toEqual({ id: "new", name: "Bob" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Bob" }),
      }),
    );
  });

  it("throws ApiError on failure response", async () => {
    mockFetch({ code: "NOT_FOUND", message: "User not found" }, false);
    const client = new Client(mockSchema, { baseURL: "http://localhost:3000" });

    await expect(client.api.getUser({ id: "999" })).rejects.toThrow(ApiError);
    await expect(client.api.getUser({ id: "999" })).rejects.toThrow("User not found");
  });

  it("throws ApiError on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const client = new Client(mockSchema, { baseURL: "http://localhost:3000" });

    await expect(client.api.getUser({ id: "1" })).rejects.toThrow(ApiError);
  });

  it("throws on unknown endpoint", () => {
    const client = new Client(mockSchema, { baseURL: "http://localhost:3000" });
    expect(() => (client.api as any).unknownEndpoint({ id: "1" })).toThrow("Unknown endpoint");
  });

  it("includes default headers", async () => {
    mockFetch({ id: "1", name: "X" });
    const client = new Client(mockSchema, {
      baseURL: "http://localhost:3000",
      headers: { Authorization: "Bearer tok123" },
    });

    await client.api.getUser({ id: "1" });
    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[1].headers).toHaveProperty("Authorization", "Bearer tok123");
    expect(fetchCall[1].headers).toHaveProperty("Content-Type", "application/json");
  });

  it("calls request interceptor", async () => {
    mockFetch({ id: "1", name: "X" });
    const interceptor = vi.fn((config) => ({
      ...config,
      headers: { ...config.headers, "X-Custom": "test" },
    }));

    const client = new Client(mockSchema, {
      baseURL: "http://localhost:3000",
      interceptors: { request: interceptor },
    });

    await client.api.getUser({ id: "1" });
    expect(interceptor).toHaveBeenCalled();

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[1].headers).toHaveProperty("X-Custom", "test");
  });

  it("calls response interceptor", async () => {
    mockFetch({ id: "1", name: "Raw" });
    const client = new Client(mockSchema, {
      baseURL: "http://localhost:3000",
      interceptors: {
        response: (data: any) => ({ ...data, name: "Intercepted" }),
      },
    });

    const result = await client.api.getUser({ id: "1" });
    expect(result.name).toBe("Intercepted");
  });
});
