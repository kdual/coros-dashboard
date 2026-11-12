import { useState } from "react";
import {
  Activity as Wave,
  Moon,
  HeartPulse,
  Gauge,
  ChartNoAxesCombined,
  Timer,
} from "lucide-react";
import {
  within,
  anchor,
  avgPace,
  total,
  run,
  pace,
  num,
  latest,
  duration,
  monday,
  type Dataset,
  type Health,
} from "./data";
import {
  Chart,
  Heading,
  Panel,
  SleepChart,
  Ring,
  StatList,
  TimeValue,
  valueUnit,
  Dialog,
  type Point,
} from "./ui";
export function PlotPanel({
  title,
  unit,
  data,
  bar = false,
  color,
}: {
  title: string;
  unit: string;
  data: Point[];
  bar?: boolean;
  color?: string;
}) {
  const [open, set] = useState(false);
  return (
    <Panel>
      <Heading
        icon={bar ? ChartNoAxesCombined : Wave}
        title={title}
        action="확대"
        onClick={() => set(true)}
      />
      <Chart data={data} unit={unit} bar={bar} color={color} height={194} />
      {open && (
        <Dialog title={title} close={() => set(false)}>
          <Chart data={data} unit={unit} bar={bar} color={color} height={280} />
          <div className="detailTable">
            <table>
              <thead>
                <tr>
                  <th>기간</th>
                  <th>{unit}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, i) => (
                  <tr key={i}>
                    <td>{p.label}</td>
                    <td>{num(p.value, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Dialog>
      )}
    </Panel>
  );
}
export function Analysis({ data, days }: { data: Dataset; days: string }) {
  const [group, setGroup] = useState("주간"),
    end = anchor(data),
    a = within(data.activities, end, days),
    runs = a.filter(run),
    fit = data.fitness;
  const buckets = new Map<string, number[]>();
  for (const r of runs) {
    if (r.km === undefined) continue;
    const key =
      group === "주간"
        ? monday(r.date)
        : group === "월간"
          ? r.date.slice(0, 7)
          : r.date.slice(0, 4);
    buckets.set(key, [...(buckets.get(key) ?? []), r.km]);
  }
  const points = [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({ label, value: total(v) }));
  const load = new Map<string, number[]>();
  for (const r of a) {
    if (r.load !== undefined)
      load.set(r.date, [...(load.get(r.date) ?? []), r.load]);
  }
  const official = within(data.health, end, days).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const loaded = [...load]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ label: date.slice(5), value: total(v) }));
  const zones = Array.from({ length: 5 }, (_, i) => ({
    label: "Z" + (i + 1),
    value: total(a.map((r) => r.zones?.[i])),
  })).map((p) => ({
    ...p,
    value: p.value === undefined ? undefined : Math.round(p.value / 60),
  }));
  const last = [...runs].sort((a, b) => b.date.localeCompare(a.date))[0],
    target = fit.predictions;
  const km = total(runs.map((x) => x.km)),
    priorEnd =
      days === "all"
        ? undefined
        : new Date(Date.parse(end + "T12:00:00Z") - Number(days) * 86400000)
            .toISOString()
            .slice(0, 10);
  const prev = priorEnd
    ? total(
        within(data.activities, priorEnd, days)
          .filter(run)
          .map((x) => x.km),
      )
    : undefined;
  return (
    <>
      <section className="summaryBand">
        <span className="tinted green">
          <ChartNoAxesCombined />
        </span>
        <div>
          <h3>훈련 추세 요약</h3>
          <p>
            {runs.length
              ? "선택 기간의 러닝은 " +
                runs.length +
                "회, 총 거리는 " +
                valueUnit(km, "km", 1) +
                "입니다. 평균 페이스는 " +
                pace(avgPace(runs)) +
                "/km입니다."
              : "선택 기간에 러닝 기록이 없습니다."}{" "}
            {prev !== undefined && km !== undefined
              ? "이전 같은 기간보다 " +
                num(Math.abs(km - prev), 1) +
                " km " +
                (km >= prev ? "증가" : "감소") +
                "했습니다."
              : ""}
          </p>
          <small>기록 기반 자체 계산 · 체력 지표는 최근 측정값</small>
        </div>
      </section>
      <div className="sectionTitle">
        <h2>러닝 거리와 훈련 부하</h2>
        <div className="seg">
          {["주간", "월간", "연간"].map((x) => (
            <button
              key={x}
              className={group === x ? "on" : ""}
              onClick={() => setGroup(x)}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
      <div className="pairGrid">
        <PlotPanel title={group + " 러닝 거리"} unit="km" data={points} bar />
        <PlotPanel
          title="일별 훈련 부하"
          unit="TL"
          data={loaded}
          color="var(--amber)"
        />
      </div>
      {official.some(
        (h) => h.shortLoad !== undefined || h.longLoad !== undefined,
      ) && (
        <div className="pairGrid bottomRow">
          {(["shortLoad", "longLoad"] as const).map((k) => (
            <PlotPanel
              key={k}
              title={
                k === "shortLoad"
                  ? "COROS 단기 훈련 부하"
                  : "COROS 장기 훈련 부하"
              }
              unit="TL"
              data={official.map((h) => ({
                label: h.date.slice(5),
                value: h[k],
              }))}
            />
          ))}
        </div>
      )}
      <div className="pairGrid bottomRow">
        <Panel>
          <Heading icon={Gauge} title="주요 체력 지표" />
          <StatList
            items={[
              ["VO₂max", valueUnit(fit.vo2, "ml/kg/min", 1)],
              ["젖산역치 페이스", pace(fit.threshold)],
              ["최근 러닝의 유산소 효과", num(last?.aerobic, 1)],
              ["최근 러닝의 무산소 효과", num(last?.anaerobic, 1)],
            ]}
          />
        </Panel>
        <Panel>
          <Heading icon={Timer} title="예상 완주 기록" />
          <StatList
            items={[
              ["5 km", duration(target?.five)],
              ["10 km", duration(target?.ten)],
              ["하프 마라톤", duration(target?.half)],
              ["풀 마라톤", duration(target?.full)],
            ]}
          />
        </Panel>
      </div>
      <div className="bottomRow">
        <PlotPanel title="심박 구간별 훈련 시간" data={zones} unit="분" bar />
      </div>
    </>
  );
}
export function HealthPage({ data, days }: { data: Dataset; days: string }) {
  const [window, setWindow] = useState<string | null>(null),
    end = anchor(data),
    h = within(data.health, end, window ?? days).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    sleep = latest(h, "sleepMinutes"),
    score = latest(h, "sleepScore"),
    rec = latest(h, "recovery");
  const stageValue = (minutes?: number, ratio?: number) =>
    minutes !== undefined ? valueUnit(minutes, "분") : valueUnit(ratio, "%");
  const pts = (k: keyof Health) =>
    h.map((v) => ({
      label: v.date.slice(5),
      value: typeof v[k] === "number" ? (v[k] as number) : undefined,
    }));
  return (
    <>
      <div className="sectionTitle first">
        <h2>수면과 회복</h2>
        <div className="seg">
          {["7", "30"].map((v) => (
            <button
              className={(window ?? days) === v ? "on" : ""}
              key={v}
              onClick={() => setWindow(v)}
            >
              {v}일
            </button>
          ))}
        </div>
      </div>
      <div className="trainingGrid">
        <Panel>
          <Heading icon={Moon} title="수면 분석" />
          <div className="chartValue">
            <TimeValue minutes={sleep?.sleepMinutes} />
          </div>
          <p className="caption">{sleep?.date} 총 수면 시간</p>
          <SleepChart h={sleep} />
          <StatList
            items={[
              ["수면 점수", valueUnit(score?.sleepScore, "점")],
              ["깊은 수면", stageValue(sleep?.deep, sleep?.deepRatio)],
              ["얕은 수면", stageValue(sleep?.light, sleep?.lightRatio)],
              ["REM 수면", stageValue(sleep?.rem, sleep?.remRatio)],
            ]}
          />
        </Panel>
        <Panel className="recoveryCard">
          <div className="contours" />
          <Heading icon={HeartPulse} title="최근 회복 상태" />
          <div className="recoveryBody">
            <Ring value={rec?.recovery} large />
            <b>{rec?.date ?? "데이터 없음"}</b>
          </div>
        </Panel>
      </div>
      <div className="pairGrid bottomRow">
        <PlotPanel title="야간 HRV" unit="ms" data={pts("hrv")} />
        <PlotPanel
          title="안정시 심박수"
          unit="bpm"
          data={pts("restHR")}
          color="var(--coral)"
        />
        <PlotPanel
          title="수면 점수"
          unit="점"
          data={pts("sleepScore")}
          color="var(--purple)"
        />
        <PlotPanel
          title="스트레스"
          unit="점"
          data={pts("stress")}
          color="var(--amber)"
        />
        <PlotPanel title="회복 상태" unit="%" data={pts("recovery")} />
      </div>
    </>
  );
}
