// Node 22.18+ loads the same TypeScript decoder used by browser file import.
// Keep FIT bytes in memory and retain only the matching session's chart data.
export async function addFitSamples(activity, encoded) {
  if (typeof encoded !== "string" || encoded.length > 20 * 1024 * 1024)
    return activity;
  const { importFit } = await import("../src/fit.ts");
  const fit = new File([Buffer.from(encoded, "base64")], "coros.fit");
  const sessions = await importFit(fit);
  const matched = sessions.find(
    (a) =>
      a.date === activity.date &&
      (activity.km == null ||
        a.km == null ||
        Math.abs(a.km - activity.km) < Math.max(0.1, activity.km * 0.02)),
  );
  if (matched) {
    if (matched.samples.length) activity.samples = matched.samples;
    if (matched.laps.length && !activity.laps?.length)
      activity.laps = matched.laps;
  }
  return activity;
}
