import { useState } from "react";
import {
  CalendarDays,
  Target,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import {
  monday,
  shift,
  dow,
  anchor,
  num,
  total,
  run,
  koreanDate,
  type Dataset,
  type Plan,
} from "./data";
import { Panel, Heading, Dialog, Empty, valueUnit } from "./ui";
import { Goal, type Nav } from "./Dashboard";
import { Button } from "./components/ui/button";
export type Prefs = { goal?: number; plans: Plan[] };
export function Plans({
  data,
  focus,
  nav,
  prefs,
  save,
}: {
  data: Dataset;
  focus?: string;
  nav: Nav;
  prefs: Prefs;
  save: (p: Prefs) => Promise<void>;
}) {
  const end = anchor(data),
    [date, setDate] = useState(
      focus && /^\d{4}-\d{2}-\d{2}$/.test(focus) ? focus : end,
    ),
    [scope, setScope] = useState("주간"),
    [edit, setEdit] = useState<"plan" | "goal" | null>(null),
    [err, setErr] = useState(""),
    [saving, setSaving] = useState(false);
  const weekStart = monday(date),
    first = date.slice(0, 7) + "-01",
    start = scope === "주간" ? weekStart : monday(first),
    n =
      scope === "주간"
        ? 7
        : Math.ceil(
            (((dow(first) + 6) % 7) +
              new Date(
                Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
              ).getUTCDate()) /
              7,
          ) * 7;
  const weekRuns = data.activities.filter(
      (a) => run(a) && a.date >= weekStart && a.date <= shift(weekStart, 6),
    ),
    plans = data.plans.filter((p) => p.date === date),
    actual = data.activities.filter((a) => a.date === date);
  const move = (i: number) => {
    if (scope === "주간") setDate(shift(date, 7 * i));
    else {
      const dt = new Date(first + "T12:00:00Z");
      dt.setUTCMonth(dt.getUTCMonth() + i);
      setDate(dt.toISOString().slice(0, 10));
    }
  };
  const commit = async (p: Prefs) => {
    setSaving(true);
    setErr("");
    try {
      await save(p);
      setEdit(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 오류");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="planToolbar">
        <div className="seg">
          {["주간", "월간"].map((x) => (
            <button
              key={x}
              className={scope === x ? "on" : ""}
              onClick={() => setScope(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <Button
          variant="default"
          onClick={() => {
            setErr("");
            setEdit("plan");
          }}
        >
          <Plus size={16} />
          일정 추가
        </Button>
      </div>
      <Panel>
        <div className="calTop">
          <h3>
            {koreanDate(scope === "주간" ? weekStart : first, true)}
            {scope === "주간"
              ? " – " + koreanDate(shift(weekStart, 6), true)
              : " 기준 월간 일정"}
          </h3>
          <div>
            <button
              className="iconBtn"
              aria-label="이전 기간"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={17} />
            </button>
            <Button onClick={() => setDate(end)}>기준일</Button>
            <button
              className="iconBtn"
              aria-label="다음 기간"
              onClick={() => move(1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
        <div className="calendar">
          <div className="calLabels">
            {["월", "화", "수", "목", "금", "토", "일"].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <div className="calDates">
            {Array.from({ length: n }, (_, i) => {
              const d = shift(start, i),
                logs = data.activities.filter((a) => a.date === d),
                ps = data.plans.filter((p) => p.date === d);
              return (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className={
                    (date === d ? "selected " : "") +
                    (scope === "월간" && d.slice(0, 7) !== date.slice(0, 7)
                      ? "faded"
                      : "")
                  }
                >
                  <b>{Number(d.slice(-2))}</b>
                  {logs.slice(0, 2).map((a) => (
                    <small key={a.id} className="completed">
                      {a.name}
                    </small>
                  ))}
                  {ps.slice(0, 2).map((p) => (
                    <small
                      key={p.id}
                      className={
                        "scheduled " +
                        (p.type === "휴식"
                          ? "rest"
                          : p.type === "근력"
                            ? "strength"
                            : "")
                      }
                    >
                      {p.name}
                    </small>
                  ))}
                  {!logs.length && !ps.length && (
                    <small className="unscheduled">일정 없음</small>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="legend">
          <i className="dot done" />
          완료 운동
          <i className="dot planned" />
          계획 운동
        </div>
      </Panel>
      <div className="trainingGrid bottomRow">
        <Panel>
          <Heading
            icon={CalendarDays}
            title={koreanDate(date, true) + " 일정"}
          />
          {!plans.length && !actual.length && (
            <Empty>등록된 운동이나 휴식 일정이 없습니다.</Empty>
          )}
          {actual.map((a) => (
            <button
              className="agenda"
              key={a.id}
              onClick={() => nav("records/" + encodeURIComponent(a.id))}
            >
              <b>{a.name}</b>
              <span>완료 · {valueUnit(a.km, "km", 1)}</span>
            </button>
          ))}
          {plans.map((p) => (
            <div className="agenda" key={p.id}>
              <div>
                <b>{p.name}</b>
                <small>
                  {p.source === "coros" ? "COROS 원본 계획" : "웹앱 계획"} ·{" "}
                  {p.type}
                  {p.km !== undefined ? " · " + num(p.km, 1) + " km" : ""}
                </small>
              </div>
              {prefs.plans.some((x) => x.id === p.id) && (
                <button
                  disabled={saving}
                  aria-label="웹앱 일정 삭제"
                  className="iconBtn"
                  onClick={() =>
                    commit({
                      ...prefs,
                      plans: prefs.plans.filter((x) => x.id !== p.id),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </Panel>
        <Panel>
          <Heading
            icon={Target}
            title="주간 목표 거리"
            onClick={() => {
              setEdit("goal");
              setErr("");
            }}
            action="수정"
          />
          <Goal km={total(weekRuns.map((x) => x.km))} goal={prefs.goal} />
        </Panel>
      </div>
      {err && (
        <p role="alert" className="error">
          {err}
        </p>
      )}
      {edit && (
        <Dialog
          title={edit === "goal" ? "주간 목표 설정" : "웹앱 일정 추가"}
          close={() => setEdit(null)}
        >
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (edit === "goal") {
                void commit({ ...prefs, goal: Number(f.get("km")) });
                return;
              }
              void commit({
                ...prefs,
                plans: [
                  ...prefs.plans,
                  {
                    id: crypto.randomUUID(),
                    name: String(f.get("name")).trim(),
                    type: String(f.get("type")),
                    date: String(f.get("date")),
                    km: f.get("km") ? Number(f.get("km")) : undefined,
                    source: "local",
                  },
                ],
              });
            }}
          >
            {edit === "plan" && (
              <>
                <label>
                  운동 이름
                  <input
                    name="name"
                    required
                    maxLength={80}
                    pattern=".*\S.*"
                    placeholder="예: 주말 롱 런"
                  />
                </label>
                <label>
                  날짜
                  <input name="date" required type="date" defaultValue={date} />
                </label>
                <label>
                  운동 유형
                  <select name="type">
                    {["러닝", "트레일 러닝", "근력", "자전거", "휴식"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </label>
              </>
            )}
            <label>
              목표 거리 (km)
              <input
                name="km"
                type="number"
                required={edit === "goal"}
                min={edit === "goal" ? 0.1 : 0}
                max={1000}
                step=".1"
                defaultValue={edit === "goal" ? prefs.goal : undefined}
              />
            </label>
            <p className="caption">
              {edit === "goal"
                ? "매주 월요일부터 일요일까지 적용합니다."
                : "웹앱에 저장하는 개인 일정입니다."}
            </p>
            {err && <p role="alert">{err}</p>}
            <Button disabled={saving} variant="default">
              저장
            </Button>
          </form>
        </Dialog>
      )}
    </>
  );
}
