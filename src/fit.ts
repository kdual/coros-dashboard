import { Decoder, Stream, type LapMesg, type RecordMesg } from "@garmin/fitsdk";

export interface FitSample {
  t: number;
  pace?: number;
  hr?: number;
  cadence?: number;
  lat?: number;
  lon?: number;
}

export interface FitActivity {
  id: string;
  date: string;
  name: string;
  type: string;
  km?: number;
  seconds?: number;
  hr?: number;
  load?: number;
  laps: { km?: number; seconds?: number; hr?: number }[];
  samples: FitSample[];
}

const sports: Record<string, string> = {
  running: "러닝",
  walking: "걷기",
  hiking: "등산",
  cycling: "사이클",
  swimming: "수영",
  training: "훈련",
  fitnessEquipment: "실내 운동",
};
const seoulDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function kilometers(value: unknown) {
  const meters = number(value);
  return meters === undefined ? undefined : meters / 1000;
}

function millis(value: unknown) {
  // Decoder converts FIT timestamps to Date objects before normalization.
  return value instanceof Date ? number(value.getTime()) : undefined;
}

function summarizeLap(lap: LapMesg) {
  return {
    km: kilometers(lap.totalDistance),
    seconds: number(lap.totalTimerTime) ?? number(lap.totalElapsedTime),
    hr: number(lap.avgHeartRate),
  };
}

function sample(record: RecordMesg, t: number, running: boolean): FitSample {
  const speed = number(record.enhancedSpeed) ?? number(record.speed);
  const cadence = number(record.cadence);
  const lat = number(record.positionLat);
  const lon = number(record.positionLong);
  const degreesPerSemicircle = 180 / 2 ** 31;
  return {
    t,
    pace: speed !== undefined && speed > 0 ? 1000 / speed : undefined,
    hr: number(record.heartRate),
    cadence:
      cadence === undefined
        ? undefined
        : (cadence + (number(record.fractionalCadence) ?? 0)) *
          (running ? 2 : 1),
    lat:
      lat !== undefined && Math.abs(lat * degreesPerSemicircle) <= 90
        ? lat * degreesPerSemicircle
        : undefined,
    lon: lon !== undefined ? lon * degreesPerSemicircle : undefined,
  };
}

/** Each FIT session becomes an activity. No file bytes or decoded data leave the browser. */
export async function importFit(file: File): Promise<FitActivity[]> {
  const bytes = await file.arrayBuffer();
  const decoder = new Decoder(Stream.fromArrayBuffer(bytes));
  if (bytes.byteLength < 14 || !decoder.isFIT())
    throw new Error(
      "FIT 형식을 확인할 수 없습니다. COROS 앱에서 내보낸 운동 파일을 선택하세요.",
    );
  if (!decoder.checkIntegrity())
    throw new Error("FIT 파일이 손상되었거나 끝까지 저장되지 않았습니다.");
  const { messages, errors } = decoder.read();
  if (errors.length) throw new Error("FIT 운동 기록을 읽을 수 없습니다.");
  const sessions = messages.sessionMesgs ?? [];
  if (!sessions.length) throw new Error("파일에 완료된 운동 세션이 없습니다.");

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const fileKey = Array.from(digest, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const laps = messages.lapMesgs ?? [];
  const records = messages.recordMesgs ?? [];
  return sessions.map((session, index) => {
    const start = millis(session.startTime);
    const end = millis(session.timestamp);
    if (start === undefined)
      throw new Error("운동 시작 시각이 없는 FIT 세션입니다.");
    const nextStart = millis(sessions[index + 1]?.startTime);
    const inSession = (time: number | undefined) =>
      time !== undefined &&
      time >= start &&
      (end === undefined || time <= end) &&
      (nextStart === undefined || time < nextStart);

    const sport = String(session.sport);
    const type = sports[sport] ?? "기타";
    const firstLap = number(session.firstLapIndex);
    const count = number(session.numLaps);
    const sessionLaps =
      firstLap !== undefined && count !== undefined
        ? laps.slice(firstLap, firstLap + count)
        : laps.filter(
            (lap) => sessions.length === 1 || inSession(millis(lap.startTime)),
          );
    const samples: FitSample[] = [];
    for (const record of records) {
      const time = millis(record.timestamp);
      if (time !== undefined && inSession(time)) {
        samples.push(
          sample(record, (time - start) / 1000, sport === "running"),
        );
      }
    }
    return {
      id: "fit-" + fileKey + "-" + index,
      date: seoulDate.format(start),
      name:
        session.sportProfileName?.trim() ||
        (type === "기타" ? "FIT 운동" : type),
      type,
      km: kilometers(session.totalDistance),
      seconds:
        number(session.totalTimerTime) ?? number(session.totalElapsedTime),
      hr: number(session.avgHeartRate),
      laps: sessionLaps.map(summarizeLap),
      samples,
    };
  });
}
