export type Lap = { km?: number; seconds?: number; hr?: number };
export type Sample = {
  t: number;
  pace?: number;
  hr?: number;
  cadence?: number;
  lat?: number;
  lon?: number;
};
export type Activity = {
  id: string;
  date: string;
  name: string;
  type: string;
  km?: number;
  seconds?: number;
  hr?: number;
  load?: number;
  laps?: Lap[];
  samples?: Sample[];
  aerobic?: number;
  anaerobic?: number;
  zones?: number[];
};
export type Stage = "deep" | "light" | "rem" | "awake";
export type Health = {
  date: string;
  sleepScore?: number;
  sleepMinutes?: number;
  deepRatio?: number;
  lightRatio?: number;
  remRatio?: number;
  shortLoad?: number;
  longLoad?: number;
  deep?: number;
  light?: number;
  rem?: number;
  stages?: { start: string; end: string; stage: Stage }[];
  hrv?: number;
  restHR?: number;
  stress?: number;
  recovery?: number;
};
export type Fitness = {
  vo2?: number;
  threshold?: number;
  predictions?: { five?: number; ten?: number; half?: number; full?: number };
};
export type Plan = {
  id: string;
  date: string;
  name: string;
  type: string;
  km?: number;
  source: "local" | "coros";
};
export type Dataset = {
  source: "demo" | "coros" | "fit";
  syncedAt?: string;
  activities: Activity[];
  health: Health[];
  fitness: Fitness;
  plans: Plan[];
  warnings?: string[];
};
export const blank = (source: Dataset["source"]): Dataset => ({
  source,
  activities: [],
  health: [],
  plans: [],
  fitness: {},
});
export const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
export const shift = (date: string, n: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const dow = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
export const monday = (date: string) => shift(date, -((dow(date) + 6) % 7));
export const koreanDate = (date: string, short = false) =>
  new Intl.DateTimeFormat(
    "ko-KR",
    short
      ? { month: "short", day: "numeric", timeZone: "Asia/Seoul" }
      : {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "short",
          timeZone: "Asia/Seoul",
        },
  ).format(new Date(date + "T12:00:00Z"));
export const num = (n: number | undefined, digits = 0) =>
  n === undefined || !Number.isFinite(n)
    ? "데이터 없음"
    : n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
export const pace = (s?: number) =>
  s === undefined || !Number.isFinite(s) || s <= 0
    ? "데이터 없음"
    : Math.floor(Math.round(s) / 60) +
      "′" +
      String(Math.round(s) % 60).padStart(2, "0") +
      "″";
export function duration(s?: number) {
  if (s === undefined) return "데이터 없음";
  const n = Math.round(s);
  return (
    (n >= 3600 ? Math.floor(n / 3600) + ":" : "") +
    String(Math.floor(n / 60) % 60).padStart(n >= 3600 ? 2 : 1, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
export const run = (a: Activity) =>
  /러닝|달리기|런닝|마라톤|트레일|트랙|run/i.test(a.type);
export function total(list: (number | undefined)[]) {
  const xs = list.filter(
    (x): x is number => x !== undefined && Number.isFinite(x),
  );
  return xs.length ? xs.reduce((a, b) => a + b, 0) : undefined;
}
export function avgPace(activities: Activity[]) {
  const xs = activities.filter((a) => run(a) && a.km && a.seconds);
  const km = total(xs.map((a) => a.km));
  return km ? total(xs.map((a) => a.seconds))! / km : undefined;
}
export const demoEnd = "2026-11-08";
export function demoData(): Dataset {
  const d = blank("demo"),
    kinds = ["이지 러닝", "템포 러닝", "회복 러닝", "롱 런"];
  for (let i = 0; i < 365; i++) {
    const date = shift(demoEnd, -i),
      week = Math.floor(i / 7),
      weekday = dow(date);
    const wave = Math.round(4 * Math.sin(i * 1.73) + 3 * Math.cos(i * 0.44));
    const minutes = 458 + wave * 4;
    const base = Date.parse(date + "T06:43:00+09:00") - (minutes + 10) * 60000;
    const sequence: Stage[] = [
      "light",
      "deep",
      "light",
      "rem",
      "light",
      "deep",
      "light",
      "awake",
      "rem",
      "light",
      "deep",
      "light",
      "rem",
      "light",
      "awake",
      "rem",
    ];
    const lengths = [
        18, 43, 22, 21, 30, 37, 32, 5, 35, 29, 24, 47, 40, 53, 5, 27,
      ],
      sum = lengths.reduce((a, b) => a + b, 0);
    let at = base;
    const counts = { deep: 0, light: 0, rem: 0, awake: 0 };
    const stages = sequence.map((stage, j) => {
      const len = Math.round((lengths[j] * (minutes + 10)) / sum);
      counts[stage] += len;
      const start = new Date(at).toISOString();
      at += len * 60000;
      return { stage, start, end: new Date(at).toISOString() };
    });
    d.health.push({
      date,
      sleepScore: 87 + wave,
      sleepMinutes: counts.deep + counts.light + counts.rem,
      deep: counts.deep,
      light: counts.light,
      rem: counts.rem,
      stages,
      hrv: i === 0 ? 72 : Math.round(65 + wave + (i % 3)),
      restHR: 48 + (i % 4),
      stress: 28 + wave,
      recovery: i === 0 ? 86 : 81 + wave,
    });
    if (![0, 2, 4, 6].includes(weekday)) continue;
    const index = [2, 4, 6, 0].indexOf(weekday),
      km =
        Math.round([8, 10, 7.5, 17][index] * (1 - (week % 7) * 0.045) * 10) /
        10;
    const seconds = Math.round(km * ([327, 298, 342, 321][index] + (week % 6)));
    d.activities.push({
      id: "demo-" + i,
      date,
      name: kinds[index],
      type: "러닝",
      km,
      seconds,
      hr: 142 + index * 3,
      load: Math.round(km * 8.2),
      aerobic: 2.8 + index * 0.2,
      anaerobic: 0.3 + index * 0.15,
      zones: [0.12, 0.48, 0.27, 0.11, 0.02].map((f) => Math.round(seconds * f)),
      laps: Array.from({ length: Math.ceil(km) }, (_, j) => {
        const dist = Math.min(1, km - j);
        return {
          km: dist,
          seconds: Math.round((seconds / km) * dist),
          hr: 140 + j,
        };
      }),
      samples: Array.from({ length: 45 }, (_, j) => ({
        t: Math.round((seconds * j) / 44),
        hr: 138 + Math.round(8 * Math.sin(j * 0.35)) + Math.round(j / 6),
        pace: seconds / km + 10 * Math.sin(j * 0.8),
        cadence: 171 + Math.round(5 * Math.sin(j)),
      })),
    });
  }
  d.plans = [
    {
      id: "demo-plan-1",
      date: shift(demoEnd, 2),
      name: "이지 러닝",
      type: "러닝",
      km: 8,
      source: "local",
    },
    {
      id: "demo-plan-2",
      date: shift(demoEnd, 4),
      name: "템포 러닝",
      type: "러닝",
      km: 10,
      source: "local",
    },
  ];
  d.fitness = {
    vo2: 52.4,
    threshold: 279,
    predictions: { five: 1370, ten: 2850, half: 6341, full: 13340 },
  };
  return d;
}
export const demo = demoData();
export function anchor(d: Dataset) {
  return d.source === "demo"
    ? demoEnd
    : d.source === "fit"
      ? (d.activities
          .map((x) => x.date)
          .sort()
          .at(-1) ?? dayKey())
      : dayKey();
}
export const ranges = [
  ["7", "최근 7일"],
  ["28", "최근 4주"],
  ["90", "최근 3개월"],
  ["365", "최근 1년"],
  ["all", "전체 기간"],
] as const;
export function within<T extends { date: string }>(
  list: T[],
  end: string,
  days: string,
) {
  return list.filter(
    (x) =>
      x.date <= end &&
      (days === "all" || x.date >= shift(end, 1 - Number(days))),
  );
}
export const latest = (data: Health[], key: keyof Health) =>
  [...data]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((x) => x[key] !== undefined);
