// Parse only labelled fields in the official English MCP reports. Missing units
// or unsupported report formats stay absent rather than becoming zero.
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const runTypes = {
  100: "야외 러닝",
  101: "실내 러닝",
  102: "트레일 러닝",
  103: "트랙 러닝",
};
const sportNames = {
  104: "하이킹",
  105: "등산",
  200: "사이클",
  201: "실내 사이클",
  300: "수영",
  301: "야외 수영",
  402: "근력 운동",
  900: "걷기",
};
const numeric = (body, pattern) => {
  const field = body.match(pattern);
  return field ? Number(field[1]) : undefined;
};
function seconds(body, pattern) {
  const field = body.match(pattern);
  return field?.[1]
    .split(":")
    .reduce((total, value) => total * 60 + Number(value), 0);
}
function blocks(body) {
  return (body ?? "")
    .split(/\n(?=\d{4}-\d{2}-\d{2}(?::|\r?\n|$))/)
    .filter((b) => isoDay.test(b.slice(0, 10)));
}
function activities(body = "") {
  return body.split(/\n(?=\d+\. )/).flatMap((block) => {
    const heading = block.match(/^\d+\. (.*?) [—–-] (\d{4}-\d{2}-\d{2})/);
    const ref = block.match(/LabelId:\s*(\d+)\s*\|\s*SportType:\s*(\d+)/);
    if (!heading || !ref) return [];
    const name = runTypes[ref[2]] ?? sportNames[ref[2]] ?? heading[1];
    return [
      {
        id: ref[1],
        sportType: Number(ref[2]),
        date: heading[2],
        name,
        type: runTypes[ref[2]] ? "러닝" : name,
        km: numeric(block, /Distance:\s*([\d.]+) km/i),
        seconds: seconds(block, /Duration:\s*(\d+(?::\d{2}){1,2})/),
        hr: numeric(block, /Avg HR:\s*(\d+) bpm/i),
        load: numeric(block, /Training Load:\s*(\d+)/i),
      },
    ];
  });
}
export function addDetail(activity, detail, lapData) {
  const fields = {
    load: numeric(detail ?? "", /^Training Load:\s*([\d.]+)/m),
    aerobic: numeric(detail ?? "", /^Aerobic TE:\s*([\d.]+)/m),
    anaerobic: numeric(detail ?? "", /^Anaerobic TE:\s*([\d.]+)/m),
  };
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined) activity[key] = value;
  // Match the length and elapsed seconds of a single complete lap grouping to
  // the activity before exposing the provider's centimetre/second data.
  for (const group of lapData?.lapGroups ?? []) {
    if (!Array.isArray(group.laps) || !activity.km) continue;
    const total = group.laps.reduce(
      (sum, lap) => sum + lap.distance / 100000,
      0,
    );
    if (
      !Number.isFinite(total) ||
      Math.abs(total - activity.km) > Math.max(0.03, activity.km * 0.015)
    )
      continue;
    activity.laps = group.laps.map((lap) => ({
      km: lap.distance / 100000,
      seconds: Number.isFinite(lap.time) ? lap.time : undefined,
      hr: lap.avgHr > 0 ? lap.avgHr : undefined,
    }));
    break;
  }
  return activity;
}
function schedule(body) {
  return blocks(body).flatMap((block) => {
    const date = block.slice(0, 10);
    const groups = block
      .slice(10)
      .trim()
      .split(/\n\s*\n/);
    return groups.flatMap((group) => {
      const lines = group
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const id = group.match(/idInPlan:\s*(\d+)/i)?.[1];
      if (!id || !lines[0]) return [];
      return [
        {
          id: "coros-" + date + "-" + id,
          date,
          name: lines[0],
          type: "계획 운동",
          km: numeric(group, /Distance:\s*([\d.]+) km/i),
          source: "coros",
        },
      ];
    });
  });
}
function minutes(block, label) {
  const match = block.match(
    new RegExp(label + ":\\s*(?:(\\d+)h\\s*)?(?:(\\d+)\\s*min)?", "m"),
  );
  return match && (match[1] || match[2])
    ? Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)
    : undefined;
}
export function normalize(reports, timestamp, warnings = []) {
  const days = new Map();
  const fill = (date, fields) => {
    if (!isoDay.test(date)) return;
    const record = days.get(date) ?? { date };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && Number.isFinite(value)) record[key] = value;
    }
    if (Object.keys(record).length > 1) days.set(date, record);
  };
  for (const b of blocks(reports.sleep)) {
    const score = numeric(b, /^Sleep Score:\s*(\d+)/m);
    if (b.includes("Sleep detail for this day is not available") && !score)
      continue;
    fill(b.slice(0, 10), {
      sleepScore: score,
      sleepMinutes: minutes(b, "^Daily Sleep"),
      deepRatio: numeric(b, /Deep Sleep Ratio:\s*(\d+)%/),
      lightRatio: numeric(b, /Light Sleep Ratio:\s*(\d+)%/),
      remRatio: numeric(b, /REM Ratio:\s*(\d+)%/),
    });
  }
  for (const b of (reports.daily ?? "").split(/\n(?=--- \d{8} ---)/)) {
    const day = b.match(/^--- (\d{4})(\d{2})(\d{2}) ---/),
      summary = b.split("Sleep Summary:")[1];
    if (!day || !summary) continue;
    fill(day.slice(1).join("-"), {
      sleepMinutes: minutes(summary, "Total"),
      deep: minutes(summary, "Deep"),
      light: minutes(summary, "Light"),
      rem: minutes(summary, "REM"),
    });
  }
  for (const b of blocks(reports.hrv))
    fill(b.slice(0, 10), { hrv: numeric(b, /HRV Avg:\s*(\d+(?:\.\d+)?) ms/) });
  for (const b of blocks(reports.rhr))
    fill(b.slice(0, 10), {
      restHR: numeric(b, /^\d{4}-\d{2}-\d{2}:\s*(\d+) bpm/),
    });
  for (const b of blocks(reports.stress))
    fill(b.slice(0, 10), { stress: numeric(b, /Average Stress:\s*(\d+)/) });
  for (const b of blocks(reports.load))
    fill(b.slice(0, 10), {
      shortLoad: numeric(b, /Short-Term Load:\s*([\d.]+)/),
      longLoad: numeric(b, /Long-Term Load:\s*([\d.]+)/),
    });
  const currentDay = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
  fill(currentDay, {
    recovery: numeric(reports.recovery ?? "", /^Recovery:\s*(\d+)%/m),
  });
  const f = reports.fitness ?? "";
  return {
    source: "coros",
    syncedAt: timestamp,
    activities: activities(reports.activity).map((a) =>
      addDetail(a, reports.details?.[a.id], reports.laps?.[a.id]),
    ),
    health: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    fitness: {
      vo2: numeric(f, /VO2max:\s*(\d+(?:\.\d+)?)/i),
      threshold: seconds(f, /Threshold Pace:\s*(\d+:\d{2})\s*\/km/),
      predictions: {
        five: seconds(f, /^5 km Prediction:\s*(\d+(?::\d{2}){1,2})/m),
        ten: seconds(f, /^10 km Prediction:\s*(\d+(?::\d{2}){1,2})/m),
        half: seconds(f, /^Half Marathon Prediction:\s*(\d+(?::\d{2}){1,2})/m),
        full: seconds(f, /^Marathon Prediction:\s*(\d+(?::\d{2}){1,2})/m),
      },
    },
    plans: schedule(reports.plans),
    warnings,
  };
}
