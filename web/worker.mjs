import { assets } from "./assets.generated.mjs";
import {
  startOAuth,
  finishOAuth,
  freshCredentials,
  syncCoros,
  fetchActivityDetail,
} from "./coros.mjs";
import {
  readState,
  writeState,
  isAuthenticated,
  passwordHash,
  hash,
  token,
  cleanPreferences,
  sessionToken,
} from "./state.mjs";
const cookieOptions = "; Path=/; HttpOnly; Secure; SameSite=Lax";
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail("입력 형식을 확인해 주세요.");
  const text = await request.text();
  if (text.length > 256000) fail("입력 용량을 초과했습니다.");
  try {
    return JSON.parse(text);
  } catch {
    fail("입력 형식을 확인해 주세요.");
  }
}
function status(value, auth) {
  return {
    authenticated: auth,
    setupRequired: !value.password,
    hosted: true,
    ...(auth
      ? {
          connected: !!value.credentials,
          canSync: !!value.credentials,
          hasData: !!value.data,
          lastSync: value.data?.syncedAt ?? null,
          error: value.error ?? null,
          syncing: value.syncUntil > Date.now(),
        }
      : {}),
  };
}
async function synchronize(env, user, snapshot) {
  if (!snapshot.value.credentials)
    fail("COROS 계정을 먼저 연결해 주세요.", 409);
  if (snapshot.value.syncUntil > Date.now())
    fail("동기화가 진행 중입니다. 잠시 후 새로고침해 주세요.", 409);
  const revision = snapshot.value.revision,
    lease = token();
  snapshot.value.syncLease = lease;
  snapshot.value.syncUntil = Date.now() + 180000;
  snapshot.value.attemptAt = Date.now();
  await writeState(env, snapshot);
  try {
    const credentials = await freshCredentials(snapshot.value.credentials),
      data = await syncCoros(credentials, snapshot.value.data),
      current = await readState(env, user);
    if (
      current.value.revision !== revision ||
      current.value.syncLease !== lease
    )
      return;
    current.value.credentials = credentials;
    current.value.data = data;
    current.value.error = null;
    current.value.syncUntil = 0;
    await writeState(env, current);
  } catch (e) {
    const current = await readState(env, user);
    if (
      current.value.revision === revision &&
      current.value.syncLease === lease
    ) {
      current.value.syncUntil = 0;
      current.value.error =
        "동기화에 실패했습니다. 연결 상태를 확인하고 다시 시도하세요.";
      await writeState(env, current);
    }
    throw e;
  }
}
async function api(request, env, ctx, user, url) {
  if (request.method === "POST" && request.headers.get("origin") !== url.origin)
    fail("요청 출처를 확인할 수 없습니다.", 403);
  const snapshot = await readState(env, user),
    s = snapshot.value,
    auth = await isAuthenticated(request, s),
    action = url.pathname.slice(5);
  if (request.method === "GET" && action === "status") {
    if (
      auth &&
      s.credentials &&
      !(s.syncUntil > Date.now()) &&
      (!s.attemptAt || Date.now() - s.attemptAt > 900000)
    )
      ctx.waitUntil(synchronize(env, user, snapshot).catch(() => {}));
    return json(status(s, auth));
  }
  if (request.method === "POST" && ["setup", "login"].includes(action)) {
    if (s.blockedUntil > Date.now())
      fail("로그인 시도가 많습니다. 5분 뒤 다시 시도하세요.", 429);
    const p = await body(request);
    if (typeof p.password !== "string" || p.password.length > 256)
      fail("비밀번호를 확인해 주세요.");
    if (action === "setup") {
      if (s.password) fail("이미 비밀번호를 설정했습니다.", 409);
      if (p.password.length < 12)
        fail("비밀번호는 12자 이상으로 설정해 주세요.");
      const salt = token();
      s.password = { salt, hash: await passwordHash(p.password, salt) };
    } else {
      if (!s.password) fail("먼저 입장 비밀번호를 설정해 주세요.", 409);
      if (
        (await passwordHash(p.password, s.password.salt)) !== s.password.hash
      ) {
        s.failures = (s.failures ?? 0) + 1;
        if (s.failures >= 8) {
          s.blockedUntil = Date.now() + 300000;
          s.failures = 0;
        }
        await writeState(env, snapshot);
        fail("비밀번호가 일치하지 않습니다.", 401);
      }
    }
    const session = token();
    s.sessions = s.sessions.filter((x) => x.expires > Date.now()).slice(-9);
    s.sessions.push({
      hash: await hash(session),
      expires: Date.now() + 8 * 3600000,
    });
    s.failures = 0;
    await writeState(env, snapshot);
    return json(status(s, true), 200, {
      "Set-Cookie":
        "__Host-coros=" + session + cookieOptions + "; Max-Age=28800",
    });
  }
  if (!auth) fail("입장 비밀번호로 로그인해 주세요.", 401);
  if (request.method === "GET" && action === "data") {
    if (!s.data) fail("COROS 계정을 연결하면 기록을 가져옵니다.", 404);
    return json(s.data);
  }
  if (action === "preferences") {
    if (request.method === "GET") return json(s.prefs);
    if (request.method === "POST") {
      s.prefs = cleanPreferences(await body(request));
      await writeState(env, snapshot);
      return json(s.prefs);
    }
  }
  if (request.method === "POST" && action === "connect") {
    s.pending = await startOAuth(url.origin);
    await writeState(env, snapshot);
    return json({ url: s.pending.url });
  }
  if (request.method === "GET" && action === "coros/callback") {
    const flow = s.pending;
    if (
      !flow ||
      Date.now() - flow.started > 600000 ||
      flow.state !== url.searchParams.get("state") ||
      !url.searchParams.get("code")
    )
      fail("COROS 인증을 완료하지 못했습니다. 다시 연결해 주세요.");
    s.pending = null;
    await writeState(env, snapshot);
    const credentials = await finishOAuth(flow, url.searchParams.get("code")),
      current = await readState(env, user);
    if (
      current.value.revision !== s.revision ||
      !(await isAuthenticated(request, current.value))
    )
      fail("연결 상태가 변경됐습니다.", 409);
    current.value.revision++;
    current.value.credentials = credentials;
    current.value.data = null;
    current.value.error = null;
    current.value.syncUntil = 0;
    await writeState(env, current);
    ctx.waitUntil(synchronize(env, user, current).catch(() => {}));
    return new Response(null, {
      status: 303,
      headers: { Location: "/", "Cache-Control": "no-store" },
    });
  }
  if (request.method === "POST" && action === "sync") {
    if (!s.credentials) fail("COROS 계정을 먼저 연결해 주세요.", 409);
    if (s.syncUntil > Date.now()) return json(status(s, true));
    ctx.waitUntil(synchronize(env, user, snapshot).catch(() => {}));
    return json({ ...status(s, true), syncing: true }, 202);
  }
  if (request.method === "POST" && action === "activity") {
    const input = await body(request),
      activity = s.data?.activities.find((a) => a.id === input.id);
    if (!activity) fail("운동 기록을 찾을 수 없습니다.", 404);
    if (!s.credentials || activity.samples?.length) return json(activity);
    if (s.syncUntil > Date.now()) return json(activity);
    const lease = token();
    s.syncLease = lease;
    s.syncUntil = Date.now() + 180000;
    await writeState(env, snapshot);
    let credentials, detail;
    try {
      credentials = await freshCredentials(s.credentials);
      detail = await fetchActivityDetail(credentials, activity);
    } catch (error) {
      const latest = await readState(env, user);
      if (latest.value.syncLease === lease) {
        latest.value.syncUntil = 0;
        await writeState(env, latest);
      }
      throw error;
    }
    const current = await readState(env, user);
    if (current.value.syncLease !== lease)
      fail("동기화 상태가 변경됐습니다.", 409);
    current.value.syncUntil = 0;
    if (
      current.value.revision !== s.revision ||
      !(await isAuthenticated(request, current.value))
    )
      fail("로그인이 변경됐습니다.", 409);
    current.value.credentials = credentials;
    const row = current.value.data?.activities.find(
      (a) => a.id === activity.id,
    );
    if (row) Object.assign(row, detail);
    await writeState(env, current);
    return json(detail);
  }
  if (request.method === "POST" && action === "password") {
    const p = await body(request);
    if (
      typeof p.password !== "string" ||
      p.password.length < 12 ||
      p.password.length > 256
    )
      fail("비밀번호는 12~256자로 설정해 주세요.");
    const salt = token();
    s.password = { salt, hash: await passwordHash(p.password, salt) };
    s.sessions = [];
    await writeState(env, snapshot);
    return json({ ok: true }, 200, {
      "Set-Cookie": "__Host-coros=" + cookieOptions + "; Max-Age=0",
    });
  }
  if (request.method === "POST" && action === "logout") {
    const digest = await hash(sessionToken(request) ?? "");
    s.sessions = s.sessions.filter((x) => x.hash !== digest);
    await writeState(env, snapshot);
    return json({ authenticated: false }, 200, {
      "Set-Cookie": "__Host-coros=" + cookieOptions + "; Max-Age=0",
    });
  }
  if (request.method === "POST" && action === "disconnect") {
    s.revision++;
    delete s.credentials;
    delete s.pending;
    delete s.data;
    s.prefs = { plans: [] };
    s.error = null;
    s.syncUntil = 0;
    await writeState(env, snapshot);
    return json(status(s, true));
  }
  fail("지원하지 않는 요청입니다.", 404);
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url),
      user = request.headers.get("oai-authenticated-user-id");
    if (!user) {
      if (url.pathname.startsWith("/api/"))
        return json({ error: "계정 로그인이 필요합니다." }, 401);
      return new Response(
        '<!doctype html><html lang="ko"><meta charset="utf-8"><title>COROS 로그인</title><p>개인 대시보드에 접근하려면 로그인하세요.</p><a target="_top" href="/signin-with-chatgpt?return_to=%2F">계정으로 로그인</a></html>',
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    try {
      if (url.pathname.startsWith("/api/"))
        return await api(request, env, ctx, user, url);
      if (!["GET", "HEAD"].includes(request.method))
        return json({ error: "지원하지 않는 요청" }, 405);
      const asset = assets[url.pathname];
      if (!asset) return json({ error: "파일 없음" }, 404);
      const bytes = Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0));
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "Content-Type": asset.type,
          "Cache-Control":
            url.pathname === "/" ? "no-store" : "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'",
        },
      });
    } catch (e) {
      return json(
        {
          error: e.status
            ? e.message
            : "요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
        e.status ?? 502,
      );
    }
  },
};
