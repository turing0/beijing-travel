"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActivityCard from "./components/ActivityCard";
import { DEFAULT_PLAN } from "./lib/defaultPlan";
import { planToText } from "./lib/share";
import type { Activity, Day, Plan } from "./lib/types";

const CACHE_KEY = "beijing-plan-cache-v1";
const TRIP_START = new Date("2026-05-29T00:00:00");
const SAVE_DEBOUNCE = 700;
const POLL_FAST = 5000; // 刚有人改动后的一段时间，拉得勤一点
const POLL_SLOW = 20000; // 没人动时放慢，省请求和电量
const ACTIVE_WINDOW = 60000; // 最后一次改动后 1 分钟内算“活跃”

type SyncState = "loading" | "synced" | "saving" | "updated" | "offline";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function newRoomCode(): string {
  return "r" + Math.random().toString(36).slice(2, 8);
}

// 从“邀请链接”或“房间号”里解析出房间号
function parseRoom(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const q = new URL(s).searchParams.get("room");
    if (q) return q;
  } catch {
    /* 不是完整链接，继续往下判断 */
  }
  const m = s.match(/room=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

// 自定义房间号：只留字母、数字、- 和 _，最长 40
function sanitizeRoom(s: string): string {
  return s
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 40);
}

interface ApiResp {
  ok: boolean;
  doc: { plan: Plan; rev: number; updatedAt: string } | null;
}

export default function Home() {
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [mounted, setMounted] = useState(false);
  const [sync, setSync] = useState<SyncState>("loading");
  const [toast, setToast] = useState("");
  const [editingHeader, setEditingHeader] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [createInput, setCreateInput] = useState("");

  const room = useRef("default");
  const revRef = useRef(0); // 最近一次已知的服务器版本
  const editSeq = useRef(0); // 本地每次改动 +1
  const savedSeq = useRef(0); // 已成功保存到服务器的改动序号
  const planRef = useRef(plan);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivity = useRef(Date.now()); // 最后一次本地/远端改动的时间
  const polling = useRef(false); // 防止两次轮询请求叠在一起
  planRef.current = plan;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  // 把当前行程写到服务器（后写覆盖）
  const doSave = useCallback(async () => {
    const seq = editSeq.current;
    setSync("saving");
    try {
      const res = await fetch(`/api/plan?room=${room.current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planRef.current }),
      });
      const data = (await res.json()) as ApiResp;
      if (!data.ok || !data.doc) throw new Error("save failed");
      revRef.current = data.doc.rev;
      savedSeq.current = seq;
      setSync(editSeq.current === seq ? "synced" : "saving");
    } catch {
      setSync("offline");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, SAVE_DEBOUNCE);
  }, [doSave]);

  // 所有“用户编辑”都走这里：更新界面 + 标记待保存 + 防抖保存
  const commit = useCallback(
    (updater: (p: Plan) => Plan) => {
      editSeq.current += 1;
      lastActivity.current = Date.now();
      setPlan((p) => {
        const next = updater(p);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* 忽略 */
        }
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  // 拉取某个房间的行程；房间还没数据就用默认行程建一份
  const loadRoom = useCallback(
    async (r: string) => {
      setSync("loading");
      try {
        const res = await fetch(`/api/plan?room=${r}`, { cache: "no-store" });
        const data = (await res.json()) as ApiResp;
        if (data.ok && data.doc) {
          setPlan(data.doc.plan);
          planRef.current = data.doc.plan;
          revRef.current = data.doc.rev;
          savedSeq.current = editSeq.current;
          setSync("synced");
        } else {
          setPlan(DEFAULT_PLAN);
          planRef.current = DEFAULT_PLAN;
          await doSave();
        }
      } catch {
        try {
          const c = localStorage.getItem(CACHE_KEY);
          if (c) setPlan(JSON.parse(c) as Plan);
        } catch {
          /* 忽略损坏的缓存 */
        }
        setSync("offline");
      }
    },
    [doSave],
  );

  // 进入某个房间：写进网址（方便分享 / 刷新还在），并开始加载
  const enterRoom = useCallback((r: string) => {
    room.current = r;
    const url = new URL(window.location.href);
    url.searchParams.set("room", r);
    window.history.replaceState(null, "", url.toString());
    setRoomId(r);
  }, []);

  // 打开页面：网址里带 room 就直接进；没带就停在首页让用户选——不再自动新建房间。
  useEffect(() => {
    setMounted(true);
    const r = new URL(window.location.href).searchParams.get("room");
    if (r) {
      room.current = r;
      setRoomId(r);
    }
  }, []);

  useEffect(() => {
    if (roomId) loadRoom(roomId);
  }, [roomId, loadRoom]);

  // 自适应轮询：活跃时 5 秒、空闲时 20 秒；切到后台完全暂停，回到前台立刻拉一次。
  // 本地有未保存改动 / 正在输入时先不覆盖，别打断正在改的人。
  useEffect(() => {
    if (!roomId) return;
    let stopped = false;

    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      const dirty = editSeq.current !== savedSeq.current;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName ?? "",
      );
      try {
        const res = await fetch(`/api/plan?room=${room.current}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as ApiResp;
        if (data.ok) {
          setSync((s) => (s === "offline" ? "synced" : s));
          if (
            data.doc &&
            data.doc.rev !== revRef.current &&
            !dirty &&
            !typing
          ) {
            setPlan(data.doc.plan);
            revRef.current = data.doc.rev;
            savedSeq.current = editSeq.current;
            lastActivity.current = Date.now(); // 对方在动，保持快节奏
            setSync("updated");
            flash("已同步对方的修改 ✨");
            window.setTimeout(() => setSync("synced"), 1500);
          }
        }
      } catch {
        setSync("offline");
      } finally {
        polling.current = false;
      }
    };

    const schedule = () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (stopped || document.hidden) return; // 后台时不安排下一次
      const active = Date.now() - lastActivity.current < ACTIVE_WINDOW;
      pollTimer.current = setTimeout(
        async () => {
          await poll();
          schedule();
        },
        active ? POLL_FAST : POLL_SLOW,
      );
    };

    const onVisibility = async () => {
      if (document.hidden) {
        if (pollTimer.current) clearTimeout(pollTimer.current);
      } else {
        await poll(); // 回到前台立刻拉最新的
        schedule();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      stopped = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [roomId, flash]);

  const daysLeft = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((TRIP_START.getTime() - now.getTime()) / 86400000);
  }, []);

  function mutateDay(dayId: string, fn: (items: Activity[]) => Activity[]) {
    commit((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.id === dayId ? { ...d, items: fn(clone(d.items)) } : d,
      ),
    }));
  }

  const updateActivity = (dayId: string, a: Activity) =>
    mutateDay(dayId, (items) => items.map((it) => (it.id === a.id ? a : it)));

  const deleteActivity = (dayId: string, aid: string) =>
    mutateDay(dayId, (items) => items.filter((it) => it.id !== aid));

  const moveActivity = (dayId: string, idx: number, dir: -1 | 1) =>
    mutateDay(dayId, (items) => {
      const j = idx + dir;
      if (j < 0 || j >= items.length) return items;
      [items[idx], items[j]] = [items[j], items[idx]];
      return items;
    });

  const addActivity = (dayId: string) =>
    mutateDay(dayId, (items) => [
      ...items,
      {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `a-${Date.now()}`,
        start: "12:00",
        title: "新活动",
        category: "free",
      },
    ]);

  async function copy(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(okMsg);
    } catch {
      flash("复制失败，请手动复制");
    }
  }

  function resetPlan() {
    if (confirm("确定要恢复成默认行程吗？当前的修改会被覆盖（对方那边也会变）。")) {
      commit(() => clone(DEFAULT_PLAN));
      flash("已恢复默认行程");
    }
  }

  const totalAgreed = plan.days
    .flatMap((d) => d.items)
    .filter((i) => i.agreed).length;
  const totalItems = plan.days.flatMap((d) => d.items).length;

  const syncLabel: Record<SyncState, string> = {
    loading: "连接中…",
    synced: "已保存 · 实时同步中",
    saving: "保存中…",
    updated: "已同步对方的修改",
    offline: "未连上服务器（改动暂存本地）",
  };
  const syncColor: Record<SyncState, string> = {
    loading: "bg-stone-100 text-stone-500",
    synced: "bg-emerald-100 text-emerald-700",
    saving: "bg-amber-100 text-amber-700",
    updated: "bg-sky-100 text-sky-700",
    offline: "bg-red-100 text-red-700",
  };

  function tryJoin() {
    const r = parseRoom(joinInput);
    if (!r) {
      flash("没认出来，贴邀请链接或填房间号");
      return;
    }
    enterRoom(r);
  }

  function tryCreate() {
    const raw = createInput.trim();
    if (!raw) {
      enterRoom(newRoomCode()); // 没填就随机一个
      return;
    }
    const r = sanitizeRoom(raw);
    if (!r) {
      flash("房间号只能用字母、数字、- 和 _");
      return;
    }
    enterRoom(r);
  }

  // 首屏：网址没带 room 时，让用户选「新建」还是「进入已有」，不自动建房间
  if (!mounted || !roomId) {
    return (
      <main className="flex min-h-full items-center justify-center bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50 px-4 py-12">
        {!mounted ? (
          <p className="text-sm text-stone-400">加载中…</p>
        ) : (
          <div className="w-full max-w-md">
            <div className="text-center">
              <span className="rounded-full bg-rose-500 px-3 py-1 text-sm font-medium text-white">
                北京 · 三天两晚
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-800">
                我们的北京三日行程
              </h1>
              <p className="mt-2 text-sm text-stone-500">
                5月29日 周五 — 5月31日 周日 · 两个人一起安排，实时同步
              </p>
            </div>

            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm">
                <div className="text-base font-semibold text-stone-800">
                  ✨ 新建一个行程
                </div>
                <div className="mt-0.5 text-sm text-stone-500">
                  从默认的三天安排开始。可以自己起个房间号（你俩好记的，
                  比如名字缩写），留空就随机生成。
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={createInput}
                    onChange={(e) => setCreateInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && tryCreate()}
                    placeholder="自定义房间号（可留空）"
                    className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-stone-800"
                  />
                  <button
                    onClick={tryCreate}
                    className="shrink-0 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
                  >
                    创建
                  </button>
                </div>
                <p className="mt-2 text-xs text-stone-400">
                  只能用字母、数字、- 和 _。若这个房间号已有行程，会直接打开它。
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="text-base font-semibold text-stone-800">
                  🔗 进入已有行程
                </div>
                <div className="mt-0.5 text-sm text-stone-500">
                  把对方发来的邀请链接或房间号贴在这里
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && tryJoin()}
                    placeholder="邀请链接 或 房间号"
                    className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
                  />
                  <button
                    onClick={tryJoin}
                    className="shrink-0 rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900"
                  >
                    进入
                  </button>
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-stone-400">
              进入后网址会带上房间号，刷新、换设备只要打开同一个链接就行
            </p>
          </div>
        )}
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-full bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <header className="text-center">
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="rounded-full bg-rose-500 px-3 py-1 font-medium text-white">
              北京 · 三天两晚
            </span>
            {mounted && daysLeft > 0 && (
              <span className="rounded-full bg-white px-3 py-1 font-medium text-rose-600 shadow-sm">
                还有 {daysLeft} 天出发
              </span>
            )}
            {mounted && daysLeft === 0 && (
              <span className="rounded-full bg-white px-3 py-1 font-medium text-rose-600 shadow-sm">
                就是今天，出发！
              </span>
            )}
            {mounted && (
              <span
                className={`rounded-full px-3 py-1 font-medium ${syncColor[sync]}`}
              >
                {sync === "synced" ? "● " : ""}
                {syncLabel[sync]}
              </span>
            )}
          </div>

          {editingHeader ? (
            <div className="mx-auto max-w-xl space-y-2">
              <input
                value={plan.title}
                onChange={(e) =>
                  commit((p) => ({ ...p, title: e.target.value }))
                }
                className="w-full rounded-lg border border-rose-200 px-3 py-2 text-center text-2xl font-bold text-stone-800"
              />
              <input
                value={plan.subtitle}
                onChange={(e) =>
                  commit((p) => ({ ...p, subtitle: e.target.value }))
                }
                className="w-full rounded-lg border border-rose-200 px-3 py-2 text-center text-sm text-stone-600"
              />
              <button
                onClick={() => setEditingHeader(false)}
                className="rounded-lg bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-600"
              >
                完成
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingHeader(true)}
              className="group mx-auto block"
              title="点击修改标题"
            >
              <h1 className="text-3xl font-bold tracking-tight text-stone-800 sm:text-4xl">
                {plan.title}
                <span className="ml-2 text-base font-normal text-stone-300 group-hover:text-rose-400">
                  ✎
                </span>
              </h1>
              <p className="mt-2 text-sm text-stone-500 sm:text-base">
                {plan.subtitle}
              </p>
            </button>
          )}

          {mounted && totalItems > 0 && (
            <p className="mt-3 text-xs text-stone-400">
              已确认 {totalAgreed} / {totalItems} 项 · 你俩改的是同一份，几秒内自动同步
            </p>
          )}
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() =>
              copy(
                window.location.href,
                "链接已复制，发给她——你们改的就是同一份～",
              )
            }
            className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
          >
            🔗 复制邀请链接
          </button>
          <button
            onClick={() => copy(planToText(plan), "行程文字已复制")}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
          >
            📋 复制成文字
          </button>
          <button
            onClick={resetPlan}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-stone-500 shadow-sm hover:bg-stone-50"
          >
            ↺ 恢复默认行程
          </button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {plan.days.map((day: Day) => (
            <section key={day.id} className="flex flex-col">
              <div className="sticky top-0 z-10 mb-3 rounded-2xl bg-white/80 px-4 py-3 backdrop-blur">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-bold text-stone-800">
                    {day.label}
                    <span className="ml-2 text-sm font-normal text-stone-500">
                      {day.weekday}
                    </span>
                  </h2>
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-600">
                    {day.tag}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {day.items.map((it, idx) => (
                  <ActivityCard
                    key={it.id}
                    activity={it}
                    isFirst={idx === 0}
                    isLast={idx === day.items.length - 1}
                    onChange={(a) => updateActivity(day.id, a)}
                    onDelete={() => deleteActivity(day.id, it.id)}
                    onMove={(dir) => moveActivity(day.id, idx, dir)}
                  />
                ))}
                <button
                  onClick={() => addActivity(day.id)}
                  className="rounded-2xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-400 transition hover:border-rose-300 hover:text-rose-500"
                >
                  + 加一项
                </button>
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 text-center text-xs text-stone-400">
          祝你们这三天玩得开心 · 行程随时一起改
        </footer>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
