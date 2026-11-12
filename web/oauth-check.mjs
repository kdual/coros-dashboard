import assert from "node:assert/strict";
import { startOAuth, finishOAuth } from "./coros.mjs";
const nativeFetch = globalThis.fetch;
const issuer = "https://mcpus.coros.com";
const site = "https://dashboard.example";
let calls = 0;
globalThis.fetch = async (url, options = {}) => {
  calls++;
  // Workers rejects redirect:error before making a network request.
  assert.equal(options.redirect, "manual");
  const path = new URL(url).pathname;
  if (path.includes("well-known"))
    return Response.json({
      issuer,
      authorization_endpoint: issuer + "/authorize",
      registration_endpoint: issuer + "/register",
      token_endpoint: issuer + "/token",
    });
  if (path === "/register") {
    const input = JSON.parse(options.body);
    assert.deepEqual(input.redirect_uris, [site + "/api/coros/callback"]);
    return Response.json({ client_id: "fixture-client" });
  }
  if (path === "/token") {
    assert.equal(
      options.body.get("redirect_uri"),
      site + "/api/coros/callback",
    );
    return Response.json({
      access_token: "fixture-access",
      token_type: "Bearer",
    });
  }
  throw Error("Unexpected endpoint");
};
try {
  const pending = await startOAuth(site);
  const authorization = new URL(pending.url);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.get("state"), pending.state);
  assert.equal(
    (await finishOAuth(pending, "fixture-code")).accessToken,
    "fixture-access",
  );
  assert.equal(calls, 3);
  globalThis.fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { Location: "https://untrusted.example/" },
    });
  await assert.rejects(() => startOAuth(site), /HTTP 302/);
  console.log(
    "Workers redirect mode, PKCE registration, callback and redirect rejection passed.",
  );
} finally {
  globalThis.fetch = nativeFetch;
}
