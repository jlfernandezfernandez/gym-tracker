import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { expect, it } from "vitest";
import { injectPrecache } from "../../scripts/build-sw.mjs";

it("serves an installed shell and assets offline without caching API responses", async () => {
  const handlers: Record<string, Function> = {};
  const saved = new Map<string, any>();
  const cache = {
    addAll: async (urls: string[]) => { urls.forEach(url => saved.set(url, {url})); },
    put: async (key: any, value: any) => { saved.set(typeof key === "string" ? key : key.url, value); },
    match: async (key: any) => saved.get(typeof key === "string" ? key : key.url.replace("https://gym.test", "")),
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    self: { __PRECACHE: ["/", "/_astro/app.hash.js", "https://telegram.org/js/telegram-web-app.js"], __CACHE: "gym-shell-test", location: {origin: "https://gym.test"}, addEventListener: (name: string, handler: Function) => {handlers[name] = handler;}, skipWaiting() {}, clients: {claim() {}} },
    caches: {open: async () => cache, keys: async () => [], delete: async () => true},
    fetch: async () => {throw new TypeError("offline");},
  });
  let work: any;
  handlers.install({waitUntil: (promise: any) => {work = promise;}});
  await work;
  const get = async (path: string, mode = "cors") => {
    let response: any;
    const url = path.startsWith("http") ? path : `https://gym.test${path}`;
    handlers.fetch({request: {url, method: "GET", mode}, respondWith: (promise: any) => {response = promise;}});
    return response;
  };
  expect(await get("/", "navigate")).toEqual({url: "/"});
  expect(await get("/_astro/app.hash.js")).toEqual({url: "/_astro/app.hash.js"});
  expect(await get("https://telegram.org/js/telegram-web-app.js")).toEqual({url: "https://telegram.org/js/telegram-web-app.js"});
  expect(await get("/api", "navigate")).toBeUndefined();
  expect(await get("/api/sessions/1")).toBeUndefined();
  expect(saved.has("/api/sessions/1")).toBe(false);
});

it("injects a versioned list of built shell assets", () => {
  const root = mkdtempSync(join(tmpdir(), "gym-shell-"));
  mkdirSync(join(root, "_astro"));
  writeFileSync(join(root, "index.html"), "shell");
  writeFileSync(join(root, "_astro", "app.hash.js"), "app");
  writeFileSync(join(root, "sw.js"), "self.addEventListener('fetch', () => {});");

  injectPrecache(root, "2.7.1");

  const worker = readFileSync(join(root, "sw.js"), "utf8");
  expect(worker).toContain('self.__PRECACHE = ["/","/_astro/app.hash.js","https://telegram.org/js/telegram-web-app.js"]');
  expect(worker).toMatch(/self\.__CACHE = "gym-shell-2\.7\.1-[a-f0-9]{12}"/);
});
