const enc = new TextEncoder(),
  dec = new TextDecoder();
export const token = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export const hash = async (value) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 100000,
            hash: "SHA-256",
          },
          key,
          256,
        ),
      ),
    ),
  );
}
async function encryptionKey(env) {
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(env.DATA_ENCRYPTION_KEY), (c) => c.charCodeAt(0)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function readState(env, user) {
  const key = "owners/" + (await hash(user)) + "/state",
    object = await env.BUCKET.get(key);
  if (!object)
    return {
      key,
      etag: null,
      value: { sessions: [], failures: 0, prefs: { plans: [] }, revision: 0 },
    };
  const bytes = new Uint8Array(await object.arrayBuffer());
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: enc.encode(key),
    },
    await encryptionKey(env),
    bytes.slice(12),
  );
  return { key, etag: object.etag, value: JSON.parse(dec.decode(plain)) };
}
export async function writeState(env, snapshot) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(snapshot.key) },
      await encryptionKey(env),
      enc.encode(JSON.stringify(snapshot.value)),
    ),
  );
  const body = new Uint8Array(12 + bytes.length);
  body.set(iv);
  body.set(bytes, 12);
  const result = await env.BUCKET.put(snapshot.key, body, {
    onlyIf: snapshot.etag
      ? { etagMatches: snapshot.etag }
      : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/octet-stream" },
  });
  if (!result)
    throw Object.assign(
      new Error("다른 요청이 처리 중입니다. 잠시 후 다시 시도하세요."),
      { status: 409 },
    );
  snapshot.etag = result.etag;
}
export const sessionToken = (request) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("__Host-coros="))
    ?.slice(13);
export async function isAuthenticated(request, state) {
  const cookie = sessionToken(request);
  if (!cookie) return false;
  const digest = await hash(cookie);
  return state.sessions.some(
    (s) => s.hash === digest && s.expires > Date.now(),
  );
}
export function cleanPreferences(p) {
  if (!p || !Array.isArray(p.plans) || p.plans.length > 500)
    throw new Error("계획을 확인해 주세요.");
  if (
    p.goal !== undefined &&
    (!Number.isFinite(p.goal) || p.goal <= 0 || p.goal > 2000)
  )
    throw new Error("목표 거리를 확인해 주세요.");
  const seen = new Set();
  const plans = p.plans.map((x) => {
    if (
      !x ||
      x.source !== "local" ||
      typeof x.id !== "string" ||
      !x.id ||
      x.id.length > 100 ||
      seen.has(x.id) ||
      typeof x.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(x.date) ||
      new Date(x.date + "T12:00:00Z").toISOString().slice(0, 10) !== x.date ||
      typeof x.name !== "string" ||
      !x.name.trim() ||
      x.name.length > 160 ||
      typeof x.type !== "string" ||
      x.type.length > 64 ||
      (x.km !== undefined &&
        (!Number.isFinite(x.km) || x.km < 0 || x.km > 2000))
    )
      throw new Error("계획 값을 확인해 주세요.");
    seen.add(x.id);
    return {
      id: x.id,
      date: x.date,
      name: x.name.trim(),
      type: x.type,
      source: "local",
      ...(x.km === undefined ? {} : { km: x.km }),
    };
  });
  return { plans, ...(p.goal === undefined ? {} : { goal: p.goal }) };
}
