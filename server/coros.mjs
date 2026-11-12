import { randomBytes, createHash } from "node:crypto";
import { normalize, addDetail } from "./normalize.mjs";
import { addFitSamples } from "./fit-detail.mjs";

const gateway = "https://mcp.coros.com";
const trusted = new Set([
  gateway,
  ...["us", "eu", "cn"].map((r) => "https://mcp" + r + ".coros.com"),
]);
const scope = "openid offline_access mcp.tools";
const dashboardOrigin = "http://127.0.0.1:4178";
const callback = dashboardOrigin + "/api/callback";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new Error("COROS 요청 실패 (" + response.status + ")");
  return response;
}
function checkedUrl(value, origin) {
  const url = new URL(value);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.protocol !== "https:"
  )
    throw new Error("OAuth 엔드포인트 확인 실패");
  return url.href;
}
export async function startOAuth() {
  const discovery = await (
    await request(gateway + "/.well-known/openid-configuration")
  ).json();
  const origin = discovery.issuer?.replace(/\/$/, "");
  if (!trusted.has(origin)) throw new Error("알 수 없는 COROS 리전");
  const registration = checkedUrl(discovery.registration_endpoint, origin);
  const authorize = checkedUrl(discovery.authorization_endpoint, origin);
  const tokenUrl = checkedUrl(discovery.token_endpoint, origin);
  const registrationData = await (
    await request(registration, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "COROS 개인 대시보드",
        redirect_uris: [callback],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope,
        token_endpoint_auth_method: "none",
      }),
    })
  ).json();
  if (!registrationData.client_id)
    throw new Error("OAuth 클라이언트 등록 실패");
  const verifier = randomBytes(48).toString("base64url"),
    state = randomBytes(32).toString("base64url");
  const url = new URL(authorize);
  url.search = new URLSearchParams({
    client_id: registrationData.client_id,
    response_type: "code",
    redirect_uri: callback,
    scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: origin + "/mcp",
  }).toString();
  return {
    url: url.href,
    origin,
    tokenUrl,
    clientId: registrationData.client_id,
    state,
    verifier,
    started: Date.now(),
  };
}
async function exchange(info, fields) {
  const data = await (
    await request(info.tokenUrl, {
      method: "POST",
      body: new URLSearchParams({ client_id: info.clientId, ...fields }),
    })
  ).json();
  if (
    typeof data.access_token !== "string" ||
    data.token_type?.toLowerCase() !== "bearer"
  )
    throw new Error("COROS 인증 실패");
  return {
    origin: info.origin,
    tokenUrl: info.tokenUrl,
    clientId: info.clientId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? info.refreshToken,
    expiresAt: Date.now() + 1000 * (Number(data.expires_in) || 3600),
  };
}
export const finishOAuth = (pending, code) =>
  exchange(pending, {
    grant_type: "authorization_code",
    code,
    redirect_uri: callback,
    code_verifier: pending.verifier,
  });
export async function freshCredentials(credentials) {
  if (credentials.expiresAt > Date.now() + 60000) return credentials;
  if (!credentials.refreshToken) throw new Error("COROS 재연결 필요");
  return exchange(credentials, {
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
  });
}
const dayOffset = (today, n) =>
  new Date(Date.parse(today + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
function reportText(result) {
  if (result.isError) throw new Error("COROS 도구 오류");
  const raw =
    result.content
      ?.filter((x) => x.type === "text")
      .map((x) => x.text)
      .join("\n") ?? "";
  let body = raw;
  try {
    const value = JSON.parse(raw);
    if (typeof value === "string") body = value;
  } catch {}
  if (
    !body ||
    /^(Tool call anomalies|Error:|Unauthorized|Request failed)/i.test(body)
  )
    throw new Error("COROS 도구 오류");
  return body;
}
async function openMcp(credentials) {
  let requestId = 0;
  async function rpc(method, params) {
    const id = ++requestId;
    const response = await request(credentials.origin + "/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + credentials.accessToken,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    let result;
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const events = (await response.text()).split(/\r?\n\r?\n/);
      for (const event of events) {
        const content = event
          .split(/\r?\n/)
          .filter((s) => s.startsWith("data:"))
          .map((s) => s.slice(5).trimStart())
          .join("\n");
        if (content) {
          const message = JSON.parse(content);
          if (message.id === id) result = message;
        }
      }
    } else result = await response.json();
    if (result?.id !== id || result.error || !result.result)
      throw new Error("MCP 응답 오류");
    return result.result;
  }
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "coros-dashboard", version: "1.0.0" },
  });
  const available = new Set();
  let cursor;
  do {
    const tools = await rpc("tools/list", cursor ? { cursor } : {});
    for (const tool of tools.tools) available.add(tool.name);
    cursor = tools.nextCursor;
  } while (cursor);
  return { available, rpc };
}
async function addActivityFromMcp(client, activity) {
  const args = { labelId: activity.id, sportType: activity.sportType };
  const result = await Promise.allSettled(
    ["getActivityDetail", "queryActivityLapData"].map(async (name) => {
      const tool = [...client.available].find(
        (n) => n.toLowerCase() === name.toLowerCase(),
      );
      if (!tool) return undefined;
      return reportText(
        await client.rpc("tools/call", { name: tool, arguments: args }),
      );
    }),
  );
  const summary =
    result[0].status === "fulfilled" ? result[0].value : undefined;
  let laps;
  if (result[1].status === "fulfilled" && result[1].value)
    try {
      laps = JSON.parse(result[1].value);
    } catch {}
  return addDetail({ ...activity }, summary, laps);
}
export async function fetchActivityDetail(credentials, activity) {
  const client = await openMcp(credentials);
  const next = await addActivityFromMcp(client, activity);
  const fitTool = [...client.available].find(
    (n) => n.toLowerCase() === "downloadactivityfitfiles",
  );
  if (fitTool && !next.samples?.length) {
    try {
      const result = await client.rpc("tools/call", {
        name: fitTool,
        arguments: {
          labelId: activity.id,
          sportType: activity.sportType,
          limit: 1,
        },
      });
      const resource = result.content?.find(
        (item) =>
          item.type === "resource" && typeof item.resource?.blob === "string",
      );
      if (resource) await addFitSamples(next, resource.resource.blob);
    } catch {
      /* Keep the summary when the file quota, format or runtime cannot supply samples. */
    }
  }
  return next;
}
export async function syncCoros(credentials, previous) {
  const { available, rpc } = await openMcp(credentials);
  const timestamp = new Date().toISOString(),
    today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
      new Date(timestamp),
    );
  const reports = {},
    warnings = [];
  const specs = [
    [
      "activity",
      "querySportRecords",
      {
        startDate: dayOffset(today, -89),
        endDate: dayOffset(today, 0),
        limit: 100,
      },
      "운동 기록",
    ],
    ["sleep", "querySleepOverview", { days: 30 }, "수면"],
    ["daily", "queryDailyHealthData", { days: 30 }, "수면 단계별 시간"],
    ["rhr", "queryRestingHeartRate", { days: 30 }, "안정시 심박수"],
    ["load", "queryTrainingLoadAssessment", { days: 30 }, "훈련 부하"],
    ["stress", "queryStressLevel", { days: 30 }, "스트레스"],
    [
      "plans",
      "queryTrainingSchedule",
      { startDate: dayOffset(today, -15), endDate: dayOffset(today, 31) },
      "운동 일정",
    ],
    ["fitness", "queryFitnessAssessmentOverview", {}, "체력 지표"],
    ["recovery", "queryRecoveryStatus", {}, "회복 상태"],
  ];
  // HRV tools support up to seven days per call. Retain official daily assessment only.
  for (let offset = -29; offset <= 0; offset += 7)
    specs.push([
      "hrv",
      "querySleepHrv",
      {
        startDate: dayOffset(today, offset),
        endDate: dayOffset(today, Math.min(offset + 6, 0)),
      },
      "HRV",
    ]);
  let passed = 0;
  for (const [key, name, args, label] of specs) {
    const actualName = [...available].find(
      (n) => n.toLowerCase() === name.toLowerCase(),
    );
    if (!actualName) {
      warnings.push(label + " 연동 미지원");
      continue;
    }
    try {
      const response = reportText(
        await rpc("tools/call", { name: actualName, arguments: args }),
      );
      const body =
        key === "hrv" ? response.split("Sleep HRV Time Series")[0] : response;
      reports[key] = (reports[key] ?? "") + "\n" + body;
      passed++;
    } catch {
      warnings.push(label + " 조회 실패");
    }
  }
  if (!passed)
    throw new Error("COROS 조회에 실패했습니다. 연결 상태를 확인해 주세요.");
  const next = normalize(reports, timestamp, [...new Set(warnings)]);
  const earlier = new Map((previous?.activities ?? []).map((a) => [a.id, a]));
  next.activities = next.activities.map((activity) => {
    const cached = earlier.get(activity.id);
    if (!cached) return activity;
    return {
      ...cached,
      ...Object.fromEntries(
        Object.entries(activity).filter(([, v]) => v !== undefined),
      ),
    };
  });
  // Preload recent runs; all other records can be expanded on demand.
  const recent = next.activities
    .filter((a) => a.type === "러닝" && a.load == null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  for (const activity of recent)
    Object.assign(
      activity,
      await addActivityFromMcp({ available, rpc }, activity),
    );
  return next;
}
