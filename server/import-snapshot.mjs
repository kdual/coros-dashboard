// Maintainer bridge for a user-authorized COROS connector export. A single JSON
// line of official tool reports is accepted on stdin, with terminal echo off.
import { normalize } from "./normalize.mjs";
import { saveCache } from "./private-cache.mjs";
import { addFitSamples } from "./fit-detail.mjs";
import { createInterface } from "node:readline";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const lines = createInterface({ input: process.stdin, terminal: false });
console.log("COROS 보고서 입력 대기 (숨김)");
try {
  for await (const line of lines) {
    if (!line.trim()) continue;
    const { reports, syncedAt } = JSON.parse(line);
    if (!Number.isFinite(Date.parse(syncedAt))) throw new Error();
    const dataset = normalize(reports, syncedAt);
    for (const [id, encoded] of Object.entries(reports.fits ?? {})) {
      const activity = dataset.activities.find((a) => a.id === id);
      if (activity) await addFitSamples(activity, encoded);
    }
    if (!dataset.activities.length && !dataset.health.length) throw new Error();
    await saveCache(dataset);
    console.log("Windows 사용자 전용 저장 완료");
    break;
  }
} catch {
  console.error("가져오기 실패");
  process.exitCode = 1;
} finally {
  lines.close();
  if (process.stdin.isTTY && !process.stdin.destroyed) {
    // Windows ConPTY may already have detached stdin after delivering Enter.
    process.stdin.once("error", () => {});
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}
