import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, X, type LucideIcon } from "lucide-react";
import { num, type Health, type Stage } from "./data";
export const emptyText = "데이터 없음";
export function Empty({ children = emptyText }: { children?: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Heading({
  icon: Icon,
  title,
  action,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="cardHeading">
      <span className="headIcon">
        <Icon size={17} />
      </span>
      <h3>{title}</h3>
      {onClick && (
        <button
          className="detailLink"
          aria-label={title + " " + (action || "상세 보기")}
          onClick={onClick}
        >
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Panel({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <section
      className={"panel " + className}
      onClick={
        onClick
          ? (e) => {
              if (
                !(e.target as Element).closest(
                  "button,a,input,select,[role=dialog]",
                )
              )
                onClick();
            }
          : undefined
      }
    >
      {children}
    </section>
  );
}
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const el = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = el.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={el}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === el.current) close();
      }}
    >
      <div className="dialogInner">
        <header>
          <h2>{title}</h2>
          <button className="iconBtn" aria-label="닫기" onClick={close}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export type Point = { label: string; value?: number };
export function Chart({
  data,
  unit,
  color = "var(--green)",
  height = 156,
  bar = false,
}: {
  data: Point[];
  unit: string;
  color?: string;
  height?: number;
  bar?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!data.some((x) => x.value !== undefined)) return <Empty />;
  const axes = (
    <>
      <CartesianGrid
        vertical={false}
        stroke="var(--grid)"
        strokeDasharray="3 4"
      />
      <XAxis
        dataKey="label"
        axisLine={false}
        tickLine={false}
        minTickGap={16}
        tickMargin={7}
        tick={{ fontSize: 10, fill: "var(--muted)" }}
      />
      <YAxis
        width={32}
        axisLine={false}
        tickLine={false}
        domain={bar ? [0, "auto"] : ["auto", "auto"]}
        tick={{ fontSize: 10, fill: "var(--muted)" }}
      />
      <Tooltip
        cursor={{ stroke: "var(--muted)", fill: "var(--tint)" }}
        content={({ active, payload, label }) =>
          active && payload?.length ? (
            <div className="tooltip">
              {label}
              <b>
                {num(Number(payload[0].value), 1)} {unit}
              </b>
            </div>
          ) : null
        }
      />
    </>
  );
  return (
    <div
      className="chart"
      style={{ height }}
      role="img"
      aria-label={unit + " 추이 그래프"}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={1}>
        {bar ? (
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 2 }}
          >
            {axes}
            <Bar
              isAnimationActive={false}
              dataKey="value"
              fill={color}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        ) : (
          <AreaChart
            data={data}
            margin={{ top: 12, right: 16, left: 0, bottom: 2 }}
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            {axes}
            <Area
              isAnimationActive={false}
              dataKey="value"
              type="monotone"
              stroke={color}
              strokeWidth={2.6}
              fill={"url(#" + id + ")"}
              dot={
                data.length <= 10
                  ? { r: 3.5, fill: "var(--card)", strokeWidth: 2 }
                  : false
              }
              connectNulls={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export const stageNames: Record<Stage, string> = {
  deep: "깊은 수면",
  light: "얕은 수면",
  rem: "REM",
  awake: "각성",
};
const stageOrder: Stage[] = ["awake", "rem", "light", "deep"];
const time = (t: string) =>
  new Date(t).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Seoul",
  });
export function SleepChart({ h }: { h?: Health }) {
  const stages = h?.stages
    ?.filter((x) => Date.parse(x.end) > Date.parse(x.start))
    .slice()
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (!stages?.length) return <Empty>시간대별 단계 데이터 없음</Empty>;
  const start = Date.parse(stages[0].start),
    end = Date.parse(stages[stages.length - 1].end);
  return (
    <div className="sleepChart">
      <div className="sleepPlot">
        {stageOrder.map((stage) => (
          <div className="sleepRow" key={stage}>
            <span>{stageNames[stage]}</span>
            <div>
              {stages
                .filter((x) => x.stage === stage)
                .map((s, j) => (
                  <i
                    className={"stage " + stage}
                    key={j}
                    style={{
                      left:
                        ((Date.parse(s.start) - start) / (end - start)) * 100 +
                        "%",
                      width:
                        ((Date.parse(s.end) - Date.parse(s.start)) /
                          (end - start)) *
                          100 +
                        "%",
                    }}
                    tabIndex={0}
                    aria-label={
                      stageNames[stage] +
                      " " +
                      time(s.start) +
                      "–" +
                      time(s.end)
                    }
                    data-tip={time(s.start) + "–" + time(s.end)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="sleepAxis">
        {[0, 1, 2, 3].map((i) => (
          <span key={i}>
            {time(new Date(start + ((end - start) * i) / 3).toISOString())}
          </span>
        ))}
      </div>
    </div>
  );
}
export function Ring({
  value,
  unit = "%",
  large = false,
}: {
  value?: number;
  unit?: string;
  large?: boolean;
}) {
  return (
    <div
      className={"ring " + (large ? "large" : "")}
      style={{
        background:
          "conic-gradient(var(--ring-ink) " +
          Math.min(Math.max(value ?? 0, 0), 100) +
          "%, var(--ring-track) 0)",
      }}
    >
      <div>
        <strong>{value === undefined ? "—" : num(value)}</strong>
        <small>{unit}</small>
      </div>
    </div>
  );
}
export function TimeValue({ minutes }: { minutes?: number }) {
  return minutes === undefined ? (
    <strong>{emptyText}</strong>
  ) : (
    <>
      <strong>{Math.floor(minutes / 60)}</strong>
      <small>시간</small>
      <strong>{Math.round(minutes) % 60}</strong>
      <small>분</small>
    </>
  );
}
export function StatList({ items }: { items: [string, string][] }) {
  return (
    <div className="statList">
      {items.map(([label, v]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}
export const valueUnit = (n: number | undefined, u: string, d = 0) =>
  n === undefined ? emptyText : num(n, d) + " " + u;
