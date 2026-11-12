import { useState, useEffect, useRef, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Footprints,
  ChartNoAxesCombined,
  HeartPulse,
  CalendarDays,
  Sun,
  Moon,
  RefreshCw,
  Database,
  ChevronRight,
  ChevronDown,
  LockKeyhole,
  Watch,
  ArrowUpRight,
  Plug,
  Upload,
  LogOut,
  CalendarRange,
  ShieldCheck,
} from "lucide-react";
import { demo, blank, anchor, koreanDate, ranges, type Dataset } from "./data";
import { privateHost, api, readData, type Status } from "./api";
import { Button } from "./components/ui/button";
import { Dialog } from "./ui";
import { Dashboard } from "./Dashboard";
import { Analysis, HealthPage } from "./Analytics";
import { Records, RecordDetail } from "./Records";
import { Plans, type Prefs } from "./Plans";
import "./style.css";
const pages = [
  {
    key: "dashboard",
    label: "대시보드",
    title: "훈련 현황 요약",
    subtitle: "러닝 훈련과 오늘의 컨디션을 한눈에 확인하세요.",
    icon: LayoutDashboard,
  },
  {
    key: "records",
    label: "운동 기록",
    title: "운동 기록",
    subtitle: "운동별 거리와 페이스, 구간 기록을 확인하세요.",
    icon: Footprints,
  },
  {
    key: "analysis",
    label: "훈련 분석",
    title: "훈련 분석",
    subtitle: "러닝 거리와 훈련 부하의 변화를 살펴보세요.",
    icon: ChartNoAxesCombined,
  },
  {
    key: "health",
    label: "건강·회복",
    title: "건강·회복",
    subtitle: "수면, 야간 HRV와 회복 상태를 함께 살펴보세요.",
    icon: HeartPulse,
  },
  {
    key: "plan",
    label: "운동 계획",
    title: "운동 계획",
    subtitle: "운동 일정을 관리하고 주간 목표 달성률을 확인하세요.",
    icon: CalendarDays,
  },
];
const route = () => location.hash.slice(1).replace(/^\//, "") || "dashboard";
const nav = (s: string) => {
  location.hash = "/" + s;
};
const publicPrefs = (): Prefs => {
  try {
    return (
      JSON.parse(localStorage.getItem("coros-demo-prefs") || "null") ?? {
        goal: 50,
        plans: [],
      }
    );
  } catch {
    return { goal: 50, plans: [] };
  }
};
const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "요청을 완료할 수 없습니다.";
function Brand() {
  return (
    <div className="brand">
      <i className="brandMark" aria-hidden="true">
        <i />
      </i>
      <strong>COROS</strong>
    </div>
  );
}
function App() {
  const [path, setPath] = useState(route),
    [days, setDays] = useState("7"),
    [theme, setTheme] = useState(
      () => localStorage.getItem("coros-theme") || "system",
    ),
    [effective, eff] = useState("light");
  const [data, setData] = useState<Dataset>(
      privateHost ? blank("coros") : demo,
    ),
    [status, setStatus] = useState<Status>({ authenticated: false }),
    [prefs, setPrefs] = useState<Prefs>(
      privateHost ? { plans: [] } : publicPrefs,
    ),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [password, pw] = useState(""),
    [confirmDelete, confirm] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    [key, detail] = path.split("/"),
    page = pages.find((x) => x.key === key) ?? pages[0];
  const locked = privateHost && !status.authenticated,
    privateRef = useRef(0);
  function clearPrivate() {
    privateRef.current++;
    setData(blank("coros"));
    setPrefs({ plans: [] });
    setStatus({ authenticated: false });
    pw("");
    setMenu(false);
    confirm(false);
  }
  async function loadPrivate() {
    const epoch = privateRef.current;
    const st = await api<Status>("status");
    if (epoch !== privateRef.current) return;
    if (!st.authenticated) {
      clearPrivate();
      return;
    }
    const [p, snapshot] = await Promise.all([
      api<Prefs>("preferences"),
      st.hasData ? readData() : Promise.resolve(blank("coros")),
    ]);
    if (epoch !== privateRef.current) return;
    setPrefs(p);
    setData(snapshot);
    setStatus(st);
    if (st.error) setError(st.error);
  }
  useEffect(() => {
    const fn = () => {
      setPath(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const t = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = t;
      eff(t);
    };
    apply();
    mq.addEventListener("change", apply);
    localStorage.setItem("coros-theme", theme);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (privateHost) {
      setBusy(true);
      loadPrivate()
        .catch((e) => setError(errMsg(e)))
        .finally(() => setBusy(false));
    }
  }, []);
  useEffect(() => {
    if (!privateHost || !status.authenticated) return;
    let live = true;
    const check = async () => {
      try {
        const next = await api<Status>("status");
        if (!live) return;
        if (!next.authenticated) {
          clearPrivate();
          return;
        }
        if (next.error) setError(next.error);
        if (
          data.source === "coros" &&
          next.hasData &&
          next.lastSync !== status.lastSync
        )
          await loadPrivate();
      } catch (e) {
        if (live) setError(errMsg(e));
      }
    };
    const timer = setInterval(check, 60000);
    window.addEventListener("focus", check);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [status.authenticated, status.lastSync, data.source]);
  async function task(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
      if (privateHost) {
        try {
          const s = await api<Status>("status");
          if (!s.authenticated) clearPrivate();
        } catch {
          clearPrivate();
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const login = (e: FormEvent) => {
    e.preventDefault();
    void task(async () => {
      await api("login", { password });
      pw("");
      await loadPrivate();
    });
  };
  const refresh = () =>
    void task(async () => {
      if (privateHost) {
        if (status.canSync) await api("sync", {});
        await loadPrivate();
        setNotice(
          status.canSync
            ? "COROS 동기화를 완료했습니다."
            : "저장된 COROS 기록을 다시 읽었습니다.",
        );
      } else {
        setData(demo);
        setNotice("예시 데이터를 다시 읽었습니다.");
      }
    });
  async function save(p: Prefs) {
    if (privateHost) {
      const result = await api<Prefs>("preferences", p);
      setPrefs(result);
    } else {
      localStorage.setItem("coros-demo-prefs", JSON.stringify(p));
      setPrefs(p);
    }
  }
  const effectiveData = { ...data, plans: [...data.plans, ...prefs.plans] },
    source =
      data.source === "demo"
        ? "예시 데이터"
        : data.source === "fit"
          ? "FIT 가져오기"
          : "COROS 개인 기록";
  const statusTime = data.syncedAt
    ? new Date(data.syncedAt).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Seoul",
      })
    : null;
  return (
    <div className="shell">
      <aside>
        <Brand />
        <div className="sideRule" />
        <nav aria-label="주 메뉴">
          {pages.map((p) => (
            <a
              key={p.key}
              className={page.key === p.key ? "active" : ""}
              aria-current={page.key === p.key ? "page" : undefined}
              href={"#/" + p.key}
            >
              <p.icon size={19} />
              <span>{p.label}</span>
            </a>
          ))}
        </nav>
        <div className="sideBottom">
          <div className="device">
            <span className="deviceIcon">
              <Watch size={24} />
            </span>
            <div>
              <b>PACE 4</b>
              <small>러닝 워크스페이스</small>
            </div>
          </div>
          <button onClick={() => setMenu(true)}>
            <Database size={15} />
            데이터 관리
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="crumb">
            <span className="mobileBrand">
              <Brand />
            </span>
            <span className="desktopCrumb">트레이닝 허브</span>
            <ChevronRight size={13} />
            <b>{page.label}</b>
          </div>
          <div className="topActions">
            <button className="sourcePill" onClick={() => setMenu(true)}>
              <i className="statusDot" />
              {locked ? "로그인 필요" : source}
            </button>
            <span className="divider" />
            <button
              className="iconBtn"
              title="테마 전환"
              aria-label={"테마 전환 · 현재 " + effective}
              onClick={() => setTheme(effective === "dark" ? "light" : "dark")}
            >
              {effective === "dark" ? <Moon size={18} /> : <Sun size={19} />}
            </button>
          </div>
        </header>
        <div className="content">
          {locked ? (
            <section className="login panel">
              <span className="loginIcon">
                <LockKeyhole size={26} />
              </span>
              <h1>개인 기록 로그인</h1>
              <p>개인 서버를 시작한 터미널에 표시된 비밀번호를 입력하세요.</p>
              <form className="form" onSubmit={login}>
                <label>
                  실행 비밀번호
                  <input
                    required
                    autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(e) => pw(e.target.value)}
                  />
                </label>
                <Button variant="default" disabled={busy}>
                  개인 대시보드 열기
                </Button>
              </form>
            </section>
          ) : (
            <>
              <div className="hero">
                <div>
                  <div className="dateLine">
                    <CalendarDays size={14} />
                    {koreanDate(anchor(data))}
                  </div>
                  <h1>{page.title}</h1>
                  <p>{page.subtitle}</p>
                </div>
                <div className="rangeGroup">
                  {page.key !== "plan" && !detail && (
                    <label className="range">
                      <CalendarRange size={15} />
                      <select
                        aria-label="조회 기간"
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                      >
                        {ranges.map(([k, l]) => (
                          <option value={k} key={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </label>
                  )}
                  <button
                    className="iconBtn refresh"
                    aria-label="데이터 새로고침"
                    title="데이터 새로고침"
                    disabled={busy}
                    onClick={refresh}
                  >
                    <RefreshCw size={16} className={busy ? "spin" : ""} />
                  </button>
                </div>
              </div>
              {data.source === "coros" && (
                <p className="syncText">
                  운동 최대 최근 90일 · 건강 최근 30일 · 합계와 평균 페이스는
                  조회된 기록으로 계산
                </p>
              )}
              {statusTime && (
                <p className="syncText">마지막 동기화 {statusTime}</p>
              )}
              {data.warnings?.length ? (
                <details className="warn">
                  <summary>
                    일부 데이터 조회 안내 ({data.warnings.length})
                  </summary>
                  {data.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </details>
              ) : null}
              {page.key === "dashboard" ? (
                <Dashboard
                  data={effectiveData}
                  days={days}
                  nav={nav}
                  goal={prefs.goal}
                />
              ) : page.key === "records" ? (
                detail ? (
                  <RecordDetail
                    key={detail}
                    data={data}
                    id={decodeURIComponent(detail)}
                    nav={nav}
                  />
                ) : (
                  <Records data={data} days={days} nav={nav} />
                )
              ) : page.key === "analysis" ? (
                <Analysis data={data} days={days} />
              ) : page.key === "health" ? (
                <HealthPage key={days} data={data} days={days} />
              ) : (
                <Plans
                  key={detail ?? "plan"}
                  focus={detail}
                  data={effectiveData}
                  nav={nav}
                  prefs={prefs}
                  save={save}
                />
              )}
            </>
          )}
          {busy && (
            <p role="status" className="toast">
              데이터를 처리하고 있습니다…
            </p>
          )}
          {(error || notice) && (
            <div
              role={error ? "alert" : "status"}
              className={"toast " + (error ? "error" : "")}
            >
              <span>{error || notice}</span>
              <button
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </main>
      {menu && (
        <Dialog
          title="데이터 관리"
          close={() => {
            setMenu(false);
            confirm(false);
          }}
        >
          <div className="settings">
            <div className="settingsLine">
              <b>화면 테마</b>
              <select
                aria-label="화면 테마"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="system">시스템 설정</option>
                <option value="light">라이트</option>
                <option value="dark">다크</option>
              </select>
            </div>
            <div className="settingsBox">
              <ShieldCheck size={19} />
              <p>
                {!privateHost
                  ? "공개 화면에는 예시 기록이 표시됩니다. 실제 COROS 기록은 이 컴퓨터의 개인 서버에서 확인하세요."
                  : locked
                    ? "로그인 후 개인 기록에 접근할 수 있습니다."
                    : data.source === "fit"
                      ? "선택한 FIT 기록을 이 탭의 메모리에서 표시합니다."
                      : "로그인한 소유자의 COROS 기록을 표시합니다."}
              </p>
            </div>
            {!privateHost ? (
              <>
                <code>node server/start.mjs</code>
                <Button asChild variant="default">
                  <a
                    href="http://127.0.0.1:4178/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <LockKeyhole size={16} />
                    개인 서버 열기
                    <ArrowUpRight size={15} />
                  </a>
                </Button>
              </>
            ) : !locked ? (
              <>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      const r = await api<{ url: string }>("connect", {});
                      location.assign(r.url);
                    })
                  }
                >
                  <Plug size={16} />
                  {status.canSync
                    ? "COROS 다시 인증"
                    : "COROS 자동 동기화 연결"}
                </Button>
                <Button disabled={busy} onClick={() => file.current?.click()}>
                  <Upload size={16} />
                  FIT 파일 가져오기
                </Button>
                <input
                  ref={file}
                  type="file"
                  accept=".fit"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (!files.length) return;
                    void task(async () => {
                      const { importFit } = await import("./fit");
                      const acts = (
                        await Promise.all(files.map(importFit))
                      ).flat();
                      const prev = data.source === "fit" ? data.activities : [];
                      setData({
                        ...blank("fit"),
                        activities: [
                          ...new Map(
                            [...prev, ...acts].map((a) => [a.id, a]),
                          ).values(),
                        ],
                      });
                      setMenu(false);
                      nav("records");
                    });
                  }}
                />
                {data.source === "fit" && (
                  <Button
                    onClick={() =>
                      void task(async () => {
                        await loadPrivate();
                        setMenu(false);
                      })
                    }
                  >
                    COROS 기록으로 돌아가기
                  </Button>
                )}
                <Button
                  onClick={() =>
                    void task(async () => {
                      await api("logout", {});
                      clearPrivate();
                    })
                  }
                >
                  <LogOut size={16} />
                  로그아웃
                </Button>
                <Button onClick={() => confirm(true)}>
                  연결 해제 및 개인 데이터 삭제
                </Button>
                {confirmDelete && (
                  <div className="settingsBox">
                    <p>
                      이 서버에 저장한 개인 기록과 연결을 삭제합니다. 시계의
                      원본은 유지됩니다.
                    </p>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          await api("disconnect", {});
                          await loadPrivate();
                          setMenu(false);
                          confirm(false);
                        })
                      }
                    >
                      삭제 확인
                    </Button>
                  </div>
                )}
              </>
            ) : null}
            {busy && <p>처리 중…</p>}
            {error && <p className="error">{error}</p>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
