// Exercises the actual loopback service with a temporary cache and synthetic
// data. Run with "node server/check.mjs" while port 4178 is free.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { normalize } from "./normalize.mjs";
import { startOAuth, finishOAuth, syncCoros } from "./coros.mjs";

const origin = "http://127.0.0.1:4178";
const dir = await mkdtemp(join(tmpdir(), "coros-check-"));
const env = { ...process.env, COROS_PRIVATE_CACHE: join(dir, "fixture.dpapi") };
let child;
try {
  const r = normalize(
    {
      activity:
        "Sport Records\n1. Outdoor Run — 2026-01-05\nDuration: 32:00 | Distance: 5.00 km\nLabelId: 123 | SportType: 100",
      sleep:
        "Sleep Overview\n2026-01-05\nSleep Score: 84\nDaily Sleep: 7h 15min",
      fitness: "VO2max: 47\nThreshold Pace: 5:01 /km\n5 km Prediction: 24:22",
    },
    "2026-01-05T06:00:00Z",
  );
  assert.equal(r.activities[0].seconds, 1920);
  assert.equal(r.health[0].sleepMinutes, 435);
  assert.equal(r.health[0].hrv, undefined);
  assert.equal(r.fitness.threshold, 301);
  assert.equal(r.fitness.predictions.five, 1462);
  const originalFetch = globalThis.fetch;
  const testIssuer = "https://mcpus.coros.com";
  globalThis.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    if (path === "/.well-known/openid-configuration")
      return Response.json({
        issuer: testIssuer,
        authorization_endpoint: testIssuer + "/authorize",
        registration_endpoint: testIssuer + "/register",
        token_endpoint: testIssuer + "/token",
      });
    if (path === "/register") return Response.json({ client_id: "fixture-id" });
    if (path === "/token") {
      assert.equal(opts.body.get("grant_type"), "authorization_code");
      return Response.json({ access_token: "fixture", token_type: "bearer" });
    }
    const { id, method, params } = JSON.parse(opts.body);
    assert.equal(opts.headers.Authorization, "Bearer fixture");
    const result =
      method === "tools/list"
        ? { tools: [{ name: "queryRecoveryStatus" }] }
        : method === "tools/call"
          ? {
              content: [
                { type: "text", text: "Recovery Status\nRecovery: 83%" },
              ],
            }
          : { protocolVersion: params.protocolVersion };
    return Response.json({ id, jsonrpc: "2.0", result });
  };
  try {
    const p = await startOAuth();
    assert.equal(
      new URL(p.url).searchParams.get("code_challenge_method"),
      "S256",
    );
    const data = await syncCoros(await finishOAuth(p, "fixture-code"));
    assert.equal(data.health[0].recovery, 83);
    assert(data.warnings.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
  child = spawn(
    process.execPath,
    [fileURLToPath(new URL("./start.mjs", import.meta.url))],
    { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  const password = await new Promise((success, fail) => {
    let output = "";
    const timer = setTimeout(
      () => fail(new Error("서버 시작 시간 초과")),
      15000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      fail(new Error("테스트 서버 시작 실패. 4178 포트를 확인하세요."));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/\n([a-zA-Z0-9_-]{24})\s*$/);
      if (match) {
        clearTimeout(timer);
        success(match[1]);
      }
    });
  });
  const get = (path, cookie) =>
    fetch(origin + path, { headers: cookie ? { cookie } : {} });
  const post = (path, body, cookie, from = origin) =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        Origin: from,
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal((await get("/api/data")).status, 401);
  assert.equal((await get("/api/preferences")).status, 401);
  assert.equal(
    (await post("/api/login", { password }, null, "https://example.org"))
      .status,
    403,
  );
  assert.equal((await post("/api/login", { password: "wrong" })).status, 401);
  const login = await post("/api/login", { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await get("/api/data", cookie)).status, 404);
  assert.equal(
    (await post("/api/preferences", { goal: -1, plans: [] }, cookie)).status,
    400,
  );
  const pref = {
    goal: 32,
    plans: [
      {
        id: "p1",
        date: "2026-02-15",
        type: "러닝",
        name: "주말 러닝",
        km: 9,
        source: "local",
      },
    ],
  };
  assert.equal((await post("/api/preferences", pref, cookie)).status, 200);
  assert.deepEqual(await (await get("/api/preferences", cookie)).json(), pref);
  assert.equal((await post("/api/sync", {}, cookie)).status, 409);
  assert.equal(
    (await post("/api/disconnect", {}, cookie, "https://example.org")).status,
    403,
  );
  assert.equal((await post("/api/disconnect", {}, cookie)).status, 200);
  assert.deepEqual(await (await get("/api/preferences", cookie)).json(), {
    plans: [],
  });
  assert.equal((await post("/api/logout", {}, cookie)).status, 200);
  assert.equal((await get("/api/preferences", cookie)).status, 401);
  console.log(
    "정규화, OAuth·MCP 모의 응답, 소유자 인증, 요청 출처, 설정 저장·삭제, 로그아웃 검사 통과",
  );
} finally {
  if (child && child.exitCode === null && !child.killed) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await rm(dir, { recursive: true, force: true });
}
