import {
  Footprints,
  Timer,
  Zap,
  HeartPulse,
  Moon,
  Activity as Wave,
  CalendarDays,
  Target,
  Gauge,
  ChevronRight,
  Clock3,
} from "lucide-react";
import {
  num,
  pace,
  duration,
  koreanDate,
  latest,
  monday,
  shift,
  total,
  avgPace,
  run,
  within,
  anchor,
  type Activity,
  type Dataset,
} from "./data";
import {
  Chart,
  Heading,
  Panel,
  SleepChart,
  Ring,
  TimeValue,
  StatList,
  Empty,
  valueUnit,
} from "./ui";
export type Nav = (page: string) => void;
export function Week({
  data,
  start,
  nav,
}: {
  data: Dataset;
  start: string;
  nav: Nav;
}) {
  return (
    <div className="weekStrip">
      {["월", "화", "수", "목", "금", "토", "일"].map((day, i) => {
        const date = shift(start, i),
          a = data.activities.filter((x) => x.date === date),
          p = data.plans.filter((x) => x.date === date),
          isEnd = date === anchor(data);
        return (
          <button
            key={day}
            className={isEnd ? "current" : ""}
            onClick={() => nav("plan/" + date)}
          >
            <span>{day}</span>
            <b>{Number(date.slice(-2))}</b>
            <i className={a.length ? "done" : p.length ? "planned" : ""} />
            <small>
              {a.length
                ? num(total(a.map((x) => x.km)), 1) + " km"
                : p.length
                  ? "계획"
                  : "—"}
            </small>
          </button>
        );
      })}
    </div>
  );
}
export function RunRows({ list, nav }: { list: Activity[]; nav: Nav }) {
  return !list.length ? (
    <Empty />
  ) : (
    <div className="runRows">
      {list.map((a, i) => (
        <button
          key={a.id}
          onClick={() => nav("records/" + encodeURIComponent(a.id))}
        >
          <span className={"runIcon tone" + (i % 3)}>
            <Footprints size={18} />
          </span>
          <span className="runName">
            <b>{a.name}</b>
            <small>
              {koreanDate(a.date, true)} · {a.type}
            </small>
          </span>
          <strong>{valueUnit(a.km, "km", 2)}</strong>
          <span className="paceCol">{pace(avgPace([a]))}</span>
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
}
export function Goal({ km, goal }: { km?: number; goal?: number }) {
  return (
    <>
      <div className="goalStat">
        <b>
          {num(km, 1)} <small>km</small>
        </b>
        <span>목표 {valueUnit(goal, "km", 1)}</span>
      </div>
      <div className="progress">
        <i
          style={{
            width: Math.min(goal && km ? (100 * km) / goal : 0, 100) + "%",
          }}
        />
      </div>
      <p className="caption">
        {goal && km !== undefined
          ? "목표의 " + num((100 * km) / goal) + "% 달성"
          : "목표 또는 거리 데이터 없음"}
      </p>
    </>
  );
}
export function Dashboard({
  data,
  days,
  nav,
  goal,
}: {
  data: Dataset;
  days: string;
  nav: Nav;
  goal?: number;
}) {
  const end = anchor(data),
    start = monday(end),
    week = data.activities.filter(
      (a) => a.date >= start && a.date <= end && run(a),
    ),
    all = within(data.activities, end, days),
    health = within(data.health, end, days),
    sleep = latest(health, "sleepMinutes"),
    hrv = latest(health, "hrv"),
    rec = latest(health, "recovery"),
    km = total(week.map((a) => a.km));
  const ks = [
    {
      title: "이번 주 러닝 거리",
      value: num(km, 1),
      unit: "km",
      icon: Footprints,
      to: "records",
      color: "green",
      note: "월요일부터 누적",
    },
    {
      title: "평균 페이스",
      value: pace(avgPace(all)),
      unit: "/km",
      icon: Timer,
      to: "analysis",
      color: "amber",
      note: "거리 가중 평균",
    },
    {
      title: "훈련 부하",
      value: num(total(all.map((a) => a.load))),
      unit: "TL",
      icon: Zap,
      to: "analysis",
      color: "coral",
      note: all.some((a) => a.load === undefined)
        ? "부하 확인 기록 합계"
        : "기간 내 누적",
    },
    {
      title: "회복 상태",
      value: num(rec?.recovery),
      unit: "%",
      icon: HeartPulse,
      to: "health",
      color: "green",
      note: "최근 측정",
    },
    {
      title: "수면 점수",
      value: num(latest(health, "sleepScore")?.sleepScore),
      unit: "점",
      icon: Moon,
      to: "health",
      color: "purple",
      note: "최근 수면",
    },
    {
      title: "HRV",
      value: num(hrv?.hrv),
      unit: "ms",
      icon: Wave,
      to: "health",
      color: "blue",
      note: "최근 야간 측정",
    },
  ];
  const series = [...health]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => ({ label: h.date.slice(5).replace("-", "/"), value: h.hrv }));
  return (
    <>
      <div className="kpiGrid">
        {ks.map((k) => (
          <button key={k.title} className="kpi" onClick={() => nav(k.to)}>
            <div className="kpiTop">
              <i className={"tinted " + k.color}>
                <k.icon size={16} />
              </i>
              <span>{k.title}</span>
            </div>
            <div
              className={
                "bigValue " + (k.value === "데이터 없음" ? "missing" : "")
              }
            >
              {k.value}
              {k.value !== "데이터 없음" && <small>{k.unit}</small>}
            </div>
            <div className="kpiNote">{k.note}</div>
          </button>
        ))}
      </div>
      <div className="sectionTitle">
        <h2>컨디션 인사이트</h2>
        <span>
          <i className="statusDot" />
          최근 측정 기준
        </span>
      </div>
      <div className="insightGrid">
        <Panel className="sleepCard" onClick={() => nav("health")}>
          <Heading
            icon={Moon}
            title="수면 분석"
            onClick={() => nav("health")}
          />
          <div className="chartValue">
            <TimeValue minutes={sleep?.sleepMinutes} />
          </div>
          <p className="caption">
            총 수면 시간{" "}
            <span>
              · {sleep ? koreanDate(sleep.date, true) : "데이터 없음"}
            </span>
          </p>
          <SleepChart h={sleep} />
        </Panel>
        <Panel onClick={() => nav("health")}>
          <Heading icon={Wave} title="HRV 추이" onClick={() => nav("health")} />
          <div className="chartValue">
            <strong>{num(hrv?.hrv)}</strong>
            {hrv && <small>ms</small>}
          </div>
          <p className="caption">
            <i className="dot hrvDot" />
            야간 심박 변이도
          </p>
          <Chart data={series} unit="ms" height={136} />
        </Panel>
        <Panel className="recoveryCard" onClick={() => nav("health")}>
          <div className="contours" aria-hidden="true" />
          <Heading
            icon={HeartPulse}
            title="회복 상태"
            onClick={() => nav("health")}
          />
          <div className="recoveryBody">
            <Ring value={rec?.recovery} large />
            <b>
              {rec?.recovery === undefined
                ? "데이터 없음"
                : rec.recovery >= 80
                  ? "회복 양호"
                  : rec.recovery >= 50
                    ? "회복 중"
                    : "회복 필요"}
            </b>
            <span>
              {rec
                ? koreanDate(rec.date, true) + " 측정"
                : "최근 측정 기록 없음"}
            </span>
          </div>
        </Panel>
      </div>
      <div className="sectionTitle">
        <h2>주간 훈련</h2>
        <span>
          {koreanDate(start, true)} – {koreanDate(shift(start, 6), true)}
        </span>
      </div>
      <div className="trainingGrid">
        <Panel onClick={() => nav("plan")}>
          <Heading
            icon={CalendarDays}
            title="훈련 캘린더"
            action="일정 보기"
            onClick={() => nav("plan")}
          />
          <Week data={data} start={start} nav={nav} />
          <div className="legend">
            <i className="dot done" />
            완료 운동
            <i className="dot planned" />
            계획 운동
          </div>
        </Panel>
        <Panel onClick={() => nav("plan")}>
          <Heading
            icon={Target}
            title="주간 러닝 목표"
            onClick={() => nav("plan")}
          />
          <Goal km={km} goal={goal} />
        </Panel>
      </div>
      <div className="trainingGrid bottomRow">
        <Panel onClick={() => nav("records")}>
          <Heading
            icon={Clock3}
            title="최근 러닝 기록"
            action="전체 보기"
            onClick={() => nav("records")}
          />
          <RunRows
            list={all
              .filter(run)
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 4)}
            nav={nav}
          />
        </Panel>
        <Panel onClick={() => nav("analysis")}>
          <Heading
            icon={Gauge}
            title="주요 체력 지표"
            onClick={() => nav("analysis")}
          />
          <StatList
            items={[
              ["VO₂max", valueUnit(data.fitness.vo2, "ml/kg/min", 1)],
              ["젖산역치 페이스", pace(data.fitness.threshold)],
              ["예상 하프 기록", duration(data.fitness.predictions?.half)],
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
