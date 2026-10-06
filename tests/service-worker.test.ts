import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const setAppBadge = vi.fn().mockResolvedValue(undefined);
  const deleteCache = vi.fn().mockResolvedValue(true);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    registration: { scope: "https://example.com/routine-command/", showNotification },
    location: { origin: "https://example.com" }, navigator: { setAppBadge, clearAppBadge: vi.fn().mockResolvedValue(undefined) },
    clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]), openWindow },
    addEventListener: (name: string, handler: typeof handlers[string]) => { handlers[name] = handler; }, skipWaiting: vi.fn(),
  };
  runInNewContext(readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8"), { self, URL, Promise, Number, caches: { keys: vi.fn().mockResolvedValue(["routine-command-shell-v8", "routine-command-shell-v9", "cash-command-shell-v1", "reef-command-assets"]), delete: deleteCache } });
  const fire = async (name: string, details: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    handlers[name]!({ ...details, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
  };
  return { fire, showNotification, setAppBadge, deleteCache, openWindow };
}

describe("Web Push service worker", () => {
  it("shows a visible notification even for malformed push data", async () => {
    const service = worker();
    await service.fire("push", { data: { json: () => { throw new Error("invalid JSON"); } } });
    expect(service.showNotification).toHaveBeenCalledWith("Routine Command", expect.objectContaining({ body: expect.stringContaining("check-in") }));
  });

  it("respects the badge preference while displaying notifications", async () => {
    const service = worker();
    await service.fire("push", { data: { json: () => ({ title: "Command check", data: { remaining: 3, badgeEnabled: false } }) } });
    expect(service.setAppBadge).not.toHaveBeenCalled();
    await service.fire("push", { data: { json: () => ({ title: "Command check", data: { remaining: 3, badgeEnabled: true } }) } });
    expect(service.setAppBadge).toHaveBeenCalledWith(3);
  });

  it("preserves caches owned by Cash Command and Reef Command", async () => {
    const service = worker();
    await service.fire("activate", {});
    expect(service.deleteCache.mock.calls).toEqual([["routine-command-shell-v8"]]);
  });

  it("opens only Routine Command when a notification URL points outside its scope", async () => {
    const service = worker();
    await service.fire("notificationclick", { notification: { close: vi.fn(), data: { url: "https://example.com/cash-command/" } } });
    expect(service.openWindow).toHaveBeenCalledWith("https://example.com/routine-command/");
  });
});
