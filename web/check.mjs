import assert from "node:assert/strict";
import worker from "./worker.mjs";
import { readState, writeState } from "./state.mjs";
class Bucket {
  entries = new Map();
  async get(key) {
    const x = this.entries.get(key);
    return x
      ? { etag: x.etag, arrayBuffer: async () => x.body.slice().buffer }
      : null;
  }
  async put(key, body, options) {
    const old = this.entries.get(key);
    if (
      (options.onlyIf.etagMatches &&
        old?.etag !== options.onlyIf.etagMatches) ||
      (options.onlyIf.etagDoesNotMatch === "*" && old)
    )
      return null;
    const etag = crypto.randomUUID();
    this.entries.set(key, { body: new Uint8Array(body), etag });
    return { etag };
  }
}
const env = {
  BUCKET: new Bucket(),
  DATA_ENCRYPTION_KEY: btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  ),
};
const origin = "https://fixture.example",
  pending = [],
  ctx = { waitUntil: (p) => pending.push(p) };
async function request(
  route,
  { method = "GET", body, cookie, user = "owner", from = origin } = {},
) {
  const headers = {};
  if (user) headers["oai-authenticated-user-id"] = user;
  if (cookie) headers.cookie = cookie;
  if (method === "POST") {
    headers.origin = from;
    headers["content-type"] = "application/json";
  }
  return worker.fetch(
    new Request(origin + "/api/" + route, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    ctx,
  );
}
assert.equal((await request("status", { user: null })).status, 401);
assert.equal((await request("data")).status, 401);
assert.equal(
  (
    await request("setup", {
      method: "POST",
      body: { password: "test password long" },
      from: "https://evil.example",
    })
  ).status,
  403,
);
assert.equal(
  (await request("status")).headers.get("cache-control"),
  "no-store",
);
assert.equal((await (await request("status")).json()).setupRequired, true);
const setup = await request("setup", {
  method: "POST",
  body: { password: "test password long" },
});
assert.equal(setup.status, 200);
const cookie = setup.headers.get("set-cookie").split(";")[0];
assert.match(setup.headers.get("set-cookie"), /Secure; SameSite=Lax/);
assert.equal(
  (await (await request("status", { cookie })).json()).authenticated,
  true,
);
assert.equal((await request("data", { cookie })).status, 404);
assert.equal(
  (await request("preferences", { cookie, user: "different-owner" })).status,
  401,
);
assert.equal(
  (
    await request("setup", {
      method: "POST",
      cookie,
      body: { password: "overwriting password" },
    })
  ).status,
  409,
);
assert.equal(
  (await request("login", { method: "POST", body: { password: "wrong" } }))
    .status,
  401,
);
const prefs = {
  goal: 50,
  plans: [
    {
      id: "1",
      date: "2026-11-12",
      name: "테스트 계획",
      type: "러닝",
      source: "local",
      km: 5,
    },
  ],
};
assert.equal(
  (await request("preferences", { method: "POST", cookie, body: prefs }))
    .status,
  200,
);
assert.deepEqual(
  await (await request("preferences", { cookie })).json(),
  prefs,
);
for (const value of env.BUCKET.entries.values()) {
  const text = new TextDecoder().decode(value.body);
  assert(!text.includes("test password long"));
  assert(!text.includes("테스트 계획"));
}
const left = await readState(env, "owner"),
  right = await readState(env, "owner");
left.value.prefs.goal = 40;
await writeState(env, left);
await assert.rejects(() => writeState(env, right), { status: 409 });
assert.equal(
  (
    await request("password", {
      method: "POST",
      cookie,
      body: { password: "new test password" },
    })
  ).status,
  200,
);
assert.equal((await request("preferences", { cookie })).status, 401);
assert.equal(
  (
    await request("login", {
      method: "POST",
      body: { password: "test password long" },
    })
  ).status,
  401,
);
const login = await request("login", {
  method: "POST",
  body: { password: "new test password" },
});
assert.equal(login.status, 200);
const updatedCookie = login.headers.get("set-cookie").split(";")[0];
assert.equal(
  (
    await request("disconnect", {
      method: "POST",
      cookie: updatedCookie,
      body: {},
    })
  ).status,
  200,
);
assert.deepEqual(
  await (await request("preferences", { cookie: updatedCookie })).json(),
  { plans: [] },
);
assert.equal(
  (await request("logout", { method: "POST", cookie: updatedCookie, body: {} }))
    .status,
  200,
);
assert.equal(
  (await request("preferences", { cookie: updatedCookie })).status,
  401,
);
for (let i = 0; i < 8; i++)
  await request("login", { method: "POST", body: { password: "wrong" } });
assert.equal(
  (
    await request("login", {
      method: "POST",
      body: { password: "new test password" },
    })
  ).status,
  429,
);
await Promise.all(pending);
console.log(
  "Web auth, origin, encrypted storage, owner isolation, concurrent updates, password rotation, disconnect and rate limit passed.",
);
