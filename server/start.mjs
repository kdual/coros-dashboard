import http from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  startOAuth,
  finishOAuth,
  freshCredentials,
  syncCoros,
  fetchActivityDetail,
} from "./coros.mjs";
import {
  loadCache,
  clearCache,
  saveCache,
  canStore,
} from "./private-cache.mjs";

const host = "127.0.0.1:4178",
  origin = "http://" + host;
const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const password = randomBytes(18).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest();
const ownerHash = hash(password);
let session,
  pending,
  credentials,
  syncTask,
  generation = 0,
  lastError;
let refreshTask;
let dataset = await loadCache().catch(() => {
  lastError = "사용자 전용 스냅샷을 열 수 없습니다.";
  return null;
});
let preferences = (await loadCache("preferences").catch(() => null)) ?? {
  plans: [],
};
let attempts = [],
  cacheQueue = Promise.resolve();
const queueCache = (op) => {
  const item = cacheQueue.then(op);
  cacheQueue = item.catch(() => {});
  return item;
};
const validSession = (req) => {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("coros_session="))
    ?.slice(14);
  return !!(
    session &&
    session.expires > Date.now() &&
    cookie &&
    timingSafeEqual(hash(cookie), session.hash)
  );
};
function headers(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
}
function json(res, status, body) {
  headers(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
async function readJson(req, limit = 2048) {
  if (
    !req.headers["content-type"]?.toLowerCase().startsWith("application/json")
  )
    throw new Error();
  let bytes = 0,
    chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function cleanPreferences(value) {
  if (!value || !Array.isArray(value.plans) || value.plans.length > 500)
    throw new Error();
  const goal = value.goal ?? undefined;
  if (
    goal !== undefined &&
    (!Number.isFinite(goal) || goal <= 0 || goal > 2000)
  )
    throw new Error();
  const ids = new Set();
  const plans = value.plans.map((item) => {
    if (
      !item ||
      item.source !== "local" ||
      typeof item.id !== "string" ||
      !item.id.length ||
      item.id.length > 100 ||
      ids.has(item.id)
    )
      throw new Error();
    const { date, name, type } = item;
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date
    )
      throw new Error();
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 160 ||
      typeof type !== "string" ||
      type.length > 64
    )
      throw new Error();
    const km = item.km ?? undefined;
    if (km !== undefined && (!Number.isFinite(km) || km < 0 || km > 2000))
      throw new Error();
    ids.add(item.id);
    return { id: item.id, date, name: name.trim(), type, km, source: "local" };
  });
  return { goal, plans };
}
function status(auth) {
  return auth
    ? {
        authenticated: true,
        connected: !!credentials,
        canSync: !!credentials,
        hasData: !!dataset,
        lastSync: dataset?.syncedAt ?? null,
        error: lastError ?? null,
      }
    : {
        authenticated: false,
        connected: false,
        canSync: false,
        hasData: false,
        lastSync: null,
      };
}
async function accessToken() {
  if (refreshTask) return refreshTask;
  const revision = generation;
  const task = freshCredentials(credentials).then((next) => {
    if (revision !== generation) throw new Error("연결이 변경됐습니다.");
    credentials = next;
    return next;
  });
  refreshTask = task;
  try {
    return await task;
  } finally {
    if (refreshTask === task) refreshTask = null;
  }
}
async function sync() {
  if (syncTask) return syncTask;
  const revision = generation;
  const task = (async () => {
    const fresh = await accessToken();
    if (revision !== generation) return;
    const next = await syncCoros(fresh, dataset);
    if (revision !== generation) return;
    dataset = next;
    lastError = null;
    if (canStore) await queueCache(() => saveCache(next));
  })();
  syncTask = task;
  try {
    await task;
  } catch (error) {
    if (revision === generation)
      lastError = "동기화 실패. 마지막으로 받은 데이터를 유지합니다.";
    throw error;
  } finally {
    if (syncTask === task) syncTask = null;
  }
}
const period = setInterval(
  () => {
    if (credentials) sync().catch(() => {});
  },
  15 * 60 * 1000,
);
period.unref();
async function route(req, res) {
  if (req.headers.host !== host) return json(res, 403, { error: "접근 거부" });
  const url = new URL(req.url, origin),
    path = url.pathname,
    method = req.method,
    auth = validSession(req);
  if (path.startsWith("/api/")) {
    if (method === "POST" && req.headers.origin !== origin)
      return json(res, 403, { error: "요청 출처 확인 실패" });
    if (method === "GET" && path === "/api/status")
      return json(res, 200, status(auth));
    if (method === "POST" && path === "/api/login") {
      attempts = attempts.filter((time) => time > Date.now() - 300000);
      if (attempts.length >= 8)
        return json(res, 429, { error: "5분 후 다시 로그인해 주세요." });
      let body;
      try {
        body = await readJson(req);
      } catch {
        return json(res, 400, { error: "입력 오류" });
      }
      if (
        typeof body?.password !== "string" ||
        !timingSafeEqual(hash(body.password), ownerHash)
      ) {
        attempts.push(Date.now());
        return json(res, 401, { error: "로그인 코드가 일치하지 않습니다." });
      }
      const token = randomBytes(32).toString("base64url");
      attempts = [];
      session = { hash: hash(token), expires: Date.now() + 8 * 3600000 };
      pending = null;
      res.setHeader(
        "Set-Cookie",
        "coros_session=" +
          token +
          "; HttpOnly; SameSite=Lax; Path=/api/; Max-Age=28800",
      );
      return json(res, 200, status(true));
    }
    if (!auth) return json(res, 401, { error: "소유자 로그인이 필요합니다." });
    if (path === "/api/preferences") {
      if (method === "GET") return json(res, 200, preferences);
      if (method === "POST") {
        let next;
        try {
          next = cleanPreferences(await readJson(req, 256 * 1024));
        } catch {
          return json(res, 400, {
            error: "계획 또는 목표 값이 올바르지 않습니다.",
          });
        }
        const revision = generation,
          owner = session;
        await queueCache(async () => {
          if (revision !== generation || owner !== session) throw new Error();
          if (canStore) await saveCache(next, "preferences");
          preferences = next;
        });
        return json(res, 200, preferences);
      }
    }
    if (method === "GET" && path === "/api/data")
      return dataset
        ? json(res, 200, dataset)
        : json(res, 404, { error: "데이터 없음" });
    if (method === "POST" && path === "/api/activity") {
      let body;
      try {
        body = await readJson(req);
      } catch {
        return json(res, 400, { error: "입력 오류" });
      }
      const activity = dataset?.activities.find((a) => a.id === body?.id);
      if (!activity) return json(res, 404, { error: "운동 기록 없음" });
      if (
        !credentials ||
        (activity.laps?.length &&
          activity.samples?.length &&
          activity.load != null)
      )
        return json(res, 200, activity);
      const revision = generation,
        owner = session;
      const detail = await fetchActivityDetail(await accessToken(), activity);
      if (revision !== generation || owner !== session)
        return json(res, 409, { error: "세션이 변경됐습니다." });
      const row = dataset?.activities.find((a) => a.id === activity.id);
      if (row) Object.assign(row, detail);
      return json(res, 200, detail);
    }
    if (method === "POST" && path === "/api/logout") {
      session = null;
      pending = null;
      res.setHeader(
        "Set-Cookie",
        "coros_session=; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      return json(res, 200, status(false));
    }
    if (method === "POST" && path === "/api/disconnect") {
      generation++;
      credentials = null;
      dataset = null;
      pending = null;
      syncTask = null;
      lastError = null;
      await queueCache(async () => {
        await clearCache();
        await clearCache("preferences");
        preferences = { plans: [] };
      });
      return json(res, 200, status(true));
    }
    if (method === "POST" && path === "/api/connect") {
      const owner = session,
        revision = generation;
      const next = await startOAuth();
      if (session !== owner || generation !== revision)
        return json(res, 409, { error: "세션이 변경됐습니다." });
      pending = next;
      return json(res, 200, { url: next.url });
    }
    if (method === "GET" && path === "/api/callback") {
      const owner = session,
        flow = pending,
        revision = generation;
      if (
        !flow ||
        Date.now() - flow.started > 600000 ||
        flow.state !== url.searchParams.get("state") ||
        !url.searchParams.get("code")
      ) {
        return json(res, 400, {
          error:
            "COROS 인증을 완료하지 못했습니다. 대시보드에서 다시 연결해 주세요.",
        });
      }
      pending = null;
      const authorized = await finishOAuth(flow, url.searchParams.get("code"));
      if (owner !== session || revision !== generation)
        return json(res, 409, { error: "세션이 변경됐습니다." });
      generation++;
      credentials = authorized;
      dataset = null;
      syncTask = null;
      await queueCache(clearCache);
      await sync().catch(() => {});
      headers(res);
      res.writeHead(303, { Location: "/" });
      return res.end();
    }
    if (method === "POST" && path === "/api/sync") {
      if (!credentials)
        return json(res, 409, {
          error: "자동 갱신을 사용하려면 COROS 계정을 연결해 주세요.",
        });
      await sync();
      return json(res, 200, status(true));
    }
    return json(res, 404, { error: "지원하지 않는 요청" });
  }
  if (method !== "GET" && method !== "HEAD")
    return json(res, 405, { error: "지원하지 않는 요청" });
  const pathname = decodeURIComponent(path)
    .replace(/^\/coros-dashboard(?:\/|$)/, "/")
    .replace(/^\/+/, "");
  const file = resolve(dist, pathname || "index.html");
  if (!file.startsWith(dist + sep))
    return json(res, 404, { error: "파일 없음" });
  try {
    const actual = await realpath(file),
      base = await realpath(dist);
    if (!actual.startsWith(base + sep) || !(await stat(actual)).isFile())
      return json(res, 404, { error: "파일 없음" });
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".woff2": "font/woff2",
      ".ico": "image/x-icon",
      ".webp": "image/webp",
    };
    headers(res);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    return res.end(method === "HEAD" ? undefined : await readFile(actual));
  } catch {
    return json(res, 404, {
      error:
        "빌드 파일이 없습니다. 프로젝트에서 npm run build를 실행해 주세요.",
    });
  }
}
const server = http.createServer((req, res) =>
  route(req, res).catch(() => {
    if (res.headersSent) {
      res.end();
      return;
    }
    json(res, 502, {
      error:
        "요청을 완료하지 못했습니다. 네트워크와 COROS 연결을 확인해 주세요.",
    });
  }),
);
server.requestTimeout = 45000;
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "4178 포트를 이미 사용 중입니다."
      : "서버를 시작할 수 없습니다.",
  );
  process.exitCode = 1;
});
server.listen(4178, "127.0.0.1", () => {
  console.log(
    origin + "\n소유자 로그인 코드 (이 실행 동안만 유효)\n" + password,
  );
});
