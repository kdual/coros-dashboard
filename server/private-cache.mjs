import { spawnSync } from "node:child_process";
import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { resolve, dirname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The delivered workspace has outputs/<project> beside work/. Independent
// checkouts use the owner's local application-data directory on Windows.
const localPath = process.env.LOCALAPPDATA
  ? resolve(process.env.LOCALAPPDATA, "CorosDashboard/private-coros.dpapi")
  : null;
export const cachePath = process.env.COROS_PRIVATE_CACHE
  ? resolve(process.env.COROS_PRIVATE_CACHE)
  : basename(dirname(project)) === "outputs"
    ? resolve(project, "../../work/private-coros.dpapi")
    : localPath;
if (cachePath && (cachePath === project || cachePath.startsWith(project + sep)))
  throw new Error("저장소 밖의 캐시 경로가 필요합니다.");
export const canStore = process.platform === "win32" && !!cachePath;
function dpapi(input, decode) {
  const action = decode ? "Unprotect" : "Protect";
  // Only base64 is transported on stdin/stdout of the child. No private payload
  // enters a command line, a public file, or an application log.
  const script =
    'Add-Type -AssemblyName System.Security; $ErrorActionPreference="Stop"; ' +
    "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); " +
    "$s=[Security.Cryptography.DataProtectionScope]::CurrentUser; " +
    "[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::" +
    action +
    "($b,$null,$s)))";
  const child = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      input: input.toString("base64"),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 24 * 1024 * 1024,
    },
  );
  if (child.status !== 0 || !child.stdout.trim())
    throw new Error("Windows 사용자 암호화 저장소에 접근할 수 없습니다.");
  return Buffer.from(child.stdout.trim(), "base64");
}
export async function saveCache(dataset, kind = "data") {
  if (!canStore) throw new Error("사용자 암호화 저장소가 없습니다.");
  const file = kind === "preferences" ? cachePath + ".prefs" : cachePath;
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(
      temporary,
      dpapi(Buffer.from(JSON.stringify(dataset)), false),
      { flag: "wx", mode: 0o600 },
    );
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function loadCache(kind = "data") {
  if (!canStore) return null;
  let encrypted;
  try {
    encrypted = await readFile(
      kind === "preferences" ? cachePath + ".prefs" : cachePath,
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(dpapi(encrypted, true).toString("utf8"));
}
export async function clearCache(kind = "data") {
  if (canStore)
    await unlink(
      kind === "preferences" ? cachePath + ".prefs" : cachePath,
    ).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
}
