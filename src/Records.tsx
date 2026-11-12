import { useState, useEffect } from "react";
import {
  Search,
  Footprints,
  ChevronRight,
  ArrowLeft,
  MapPin,
  List,
  GitCompare,
} from "lucide-react";
import {
  within,
  anchor,
  avgPace,
  duration,
  pace,
  koreanDate,
  type Activity,
  type Dataset,
  type Sample,
} from "./data";
import { Empty, Panel, Heading, StatList, valueUnit } from "./ui";
import { PlotPanel } from "./Analytics";
import { Button } from "./components/ui/button";
import type { Nav } from "./Dashboard";
import { api } from "./api";
export function Records({
  data,
  days,
  nav,
}: {
  data: Dataset;
  days: string;
  nav: Nav;
}) {
  const [query, q] = useState(""),
    [type, t] = useState(""),
    [date, d] = useState(""),
    [sort, s] = useState("new");
  const candidates = within(data.activities, anchor(data), days),
    list = candidates
      .filter(
        (a) =>
          (!type || a.type === type) &&
          (!date || a.date === date) &&
          (a.name + " " + a.date + " " + a.type)
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "km"
          ? (b.km ?? -1) - (a.km ?? -1)
          : sort === "old"
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date),
      );
  return (
    <Panel>
      <div className="filters">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="운동 검색"
            placeholder="운동 이름이나 날짜 검색"
            value={query}
            onChange={(e) => q(e.target.value)}
          />
        </label>
        <select
          aria-label="운동 유형"
          value={type}
          onChange={(e) => t(e.target.value)}
        >
          <option value="">모든 운동 유형</option>
          {[...new Set(data.activities.map((a) => a.type))].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="운동 날짜"
          value={date}
          onChange={(e) => d(e.target.value)}
        />
        <select
          aria-label="정렬"
          value={sort}
          onChange={(e) => s(e.target.value)}
        >
          <option value="new">최신순</option>
          <option value="old">오래된 순</option>
          <option value="km">거리순</option>
        </select>
      </div>
      <div className="sectionTitle">
        <h3>운동 기록</h3>
        <span>{list.length}개 기록</span>
      </div>
      {list.length ? (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                {[
                  "운동",
                  "날짜",
                  "거리",
                  "운동 시간",
                  "평균 페이스",
                  "심박수",
                  "",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button
                      className="tableBtn"
                      onClick={() => nav("records/" + encodeURIComponent(a.id))}
                    >
                      <Footprints size={17} />
                      {a.name}
                    </button>
                  </td>
                  <td>{a.date}</td>
                  <td>{valueUnit(a.km, "km", 2)}</td>
                  <td>{duration(a.seconds)}</td>
                  <td>
                    {a.km && a.seconds ? pace(a.seconds / a.km) : "데이터 없음"}
                  </td>
                  <td>{valueUnit(a.hr, "bpm")}</td>
                  <td>
                    <button
                      className="iconBtn"
                      aria-label={a.name + " 상세"}
                      onClick={() => nav("records/" + encodeURIComponent(a.id))}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>조건에 맞는 운동 기록이 없습니다.</Empty>
      )}
    </Panel>
  );
}
function RouteMap({ samples }: { samples: Sample[] }) {
  const coords = samples.filter(
    (s): s is Sample & { lat: number; lon: number } =>
      Number.isFinite(s.lat) && Number.isFinite(s.lon),
  );
  if (coords.length < 2) return <Empty>GPS 경로 데이터 없음</Empty>;
  const lat0 = coords[0].lat,
    lon0 = coords[0].lon,
    scale = Math.cos((lat0 * Math.PI) / 180),
    xy = coords.map((s) => [(s.lon - lon0) * scale, lat0 - s.lat]);
  const [minX, maxX, minY, maxY] = xy.reduce(
    ([x0, x1, y0, y1], [x, y]) => [
      Math.min(x0, x),
      Math.max(x1, x),
      Math.min(y0, y),
      Math.max(y1, y),
    ],
    [Infinity, -Infinity, Infinity, -Infinity],
  );
  const f = Math.min(
      560 / Math.max(maxX - minX, 0.00001),
      210 / Math.max(maxY - minY, 0.00001),
    ),
    p = xy.map(([x, y]) => [(x - minX) * f + 20, (y - minY) * f + 20]);
  return (
    <>
      <svg
        className="routeMap"
        viewBox="0 0 600 250"
        role="img"
        aria-label="북쪽이 위인 GPS 경로 지도"
      >
        <polyline
          points={p.map((v) => v.join(",")).join(" ")}
          stroke="var(--green)"
          fill="none"
          strokeWidth="3"
        />
        <circle cx={p[0][0]} cy={p[0][1]} r="5" fill="var(--green)" />
        <circle cx={p.at(-1)![0]} cy={p.at(-1)![1]} r="4" fill="var(--amber)" />
      </svg>
      <p className="caption">
        북쪽 ↑ · 초록색 출발 / 앰버색 도착 · 기기 내 GPS 좌표로 표시
      </p>
    </>
  );
}
export function RecordDetail({
  data,
  id,
  nav,
}: {
  data: Dataset;
  id: string;
  nav: Nav;
}) {
  const summary = data.activities.find((x) => x.id === id),
    [detail, loaded] = useState<Activity>(),
    [loadError, failed] = useState(""),
    [pending, loading] = useState(false),
    [choice, set] = useState("");
  useEffect(() => {
    if (data.source !== "coros" || !summary) return;
    let active = true;
    loading(true);
    api<Activity>("activity", { id })
      .then((a) => {
        if (active) loaded(a);
      })
      .catch(() => {
        if (active)
          failed("상세 조회에 실패했습니다. 저장된 기록을 표시합니다.");
      })
      .finally(() => {
        if (active) loading(false);
      });
    return () => {
      active = false;
    };
  }, [data.source, id, summary]);
  const a = detail ?? summary;
  if (!a)
    return (
      <Panel>
        <Empty>운동 기록을 찾을 수 없습니다.</Empty>
      </Panel>
    );
  const earlier = data.activities
      .filter((x) => x.date < a.date && x.type === a.type)
      .sort((a, b) => b.date.localeCompare(a.date)),
    prev = earlier.find((x) => x.id === choice) ?? earlier[0],
    samples = a.samples ?? [];
  return (
    <>
      {pending && (
        <p role="status" className="caption">
          상세 기록 조회 중…
        </p>
      )}
      {loadError && (
        <p role="alert" className="caption">
          {loadError}
        </p>
      )}
      <Button onClick={() => nav("records")}>
        <ArrowLeft size={15} />
        목록으로
      </Button>
      <div className="sectionTitle">
        <h2>{a.name}</h2>
        <span>{koreanDate(a.date)}</span>
      </div>
      <div className="pairGrid">
        <Panel>
          <Heading icon={Footprints} title="운동 요약" />
          <StatList
            items={[
              ["거리", valueUnit(a.km, "km", 2)],
              ["운동 시간", duration(a.seconds)],
              [
                "평균 페이스",
                a.km && a.seconds ? pace(a.seconds / a.km) : "데이터 없음",
              ],
              ["평균 심박수", valueUnit(a.hr, "bpm")],
            ]}
          />
        </Panel>
        <Panel>
          <Heading icon={MapPin} title="GPS 경로 지도" />
          <RouteMap samples={samples} />
        </Panel>
      </div>
      <div className="pairGrid bottomRow">
        <Panel>
          <Heading icon={List} title="구간별 랩" />
          {a.laps?.length ? (
            <div className="detailTable">
              <table>
                <thead>
                  <tr>
                    {["랩", "거리", "시간", "페이스", "심박수"].map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.laps.map((l, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{valueUnit(l.km, "km", 2)}</td>
                      <td>{duration(l.seconds)}</td>
                      <td>
                        {l.km && l.seconds
                          ? pace(l.seconds / l.km)
                          : "데이터 없음"}
                      </td>
                      <td>{valueUnit(l.hr, "bpm")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
        </Panel>
        <Panel>
          <Heading icon={GitCompare} title="이전 운동과 비교" />
          {prev ? (
            <>
              <select
                aria-label="비교 운동"
                value={prev.id}
                onChange={(e) => set(e.target.value)}
              >
                {earlier.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.date} · {x.name}
                  </option>
                ))}
              </select>
              <StatList
                items={[
                  [
                    "거리 (이전 → 현재)",
                    valueUnit(prev.km, "km", 1) +
                      " → " +
                      valueUnit(a.km, "km", 1),
                  ],
                  [
                    "페이스",
                    pace(avgPace([prev])) + " → " + pace(avgPace([a])),
                  ],
                  [
                    "운동 시간",
                    duration(prev.seconds) + " → " + duration(a.seconds),
                  ],
                ]}
              />
            </>
          ) : (
            <Empty>비교할 이전 운동 없음</Empty>
          )}
        </Panel>
      </div>
      <div className="pairGrid bottomRow">
        {(["pace", "hr", "cadence"] as const).map((k, i) => (
          <PlotPanel
            key={k}
            title={["페이스", "심박수", "케이던스"][i]}
            unit={["초/km", "bpm", a.type === "사이클" ? "rpm" : "spm"][i]}
            data={samples.map((s) => ({ label: duration(s.t), value: s[k] }))}
          />
        ))}
      </div>
    </>
  );
}
