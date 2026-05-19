"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActivityCard from "./components/ActivityCard";
import { DEFAULT_PLAN } from "./lib/defaultPlan";
import { planToText } from "./lib/share";
import type { Activity, Day, Plan } from "./lib/types";

const CACHE_KEY = "beijing-plan-cache-v1";
const TRIP_START = new Date("2026-05-29T00:00:00");
const SAVE_DEBOUNCE = 700;
const POLL_MS = 3000;

type SyncState = "loading" | "synced" | "saving" | "updated" | "offline";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
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

  const room = useRef("default");
  const revRef = useRef(0); // 最近一次已知的服务器版本
  const editSeq = useRef(0); // 本地每次改动 +1
  const savedSeq = useRef(0); // 已成功保存到服务器的改动序号
  const planRef = useRef(plan);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // 初始化：确定房间号 → 拉取服务器上的行程（没有就用默认并建一份）
  useEffect(() => {
    setMounted(true);
    const url = new URL(window.location.href);
    let r = url.searchParams.get("room");
    if (!r) {
      r = "r" + Math.random().toString(36).slice(2, 8);
      url.searchParams.set("room", r);
      window.history.replaceState(null, "", url.toString());
    }
    room.current = r;

    (async () => {
      try {
        const res = await fetch(`/api/plan?room=${r}`, { cache: "no-store" });
        const data = (await res.json()) as ApiResp;
        if (data.ok && data.doc) {
          setPlan(data.doc.plan);
          revRef.current = data.doc.rev;
          savedSeq.current = editSeq.current;
          setSync("synced");
        } else {
          // 房间还没数据：用本地缓存或默认行程初始化一份
          let seed = DEFAULT_PLAN;
          try {
            const c = localStorage.getItem(CACHE_KEY);
            if (c) seed = JSON.parse(c) as Plan;
          } catch {
            /* 忽略 */
          }
          setPlan(seed);
          planRef.current = seed;
          await doSave();
        }
      } catch {
        try {
          const c = localStorage.getItem(CACHE_KEY);
          if (c) setPlan(JSON.parse(c) as Plan);
        } catch {
          /* 忽略 */
        }
        setSync("offline");
      }
    })();
  }, [doSave]);

  // 轮询：每 3 秒看看对方有没有改；本地有未保存改动 / 正在输入时先不覆盖
  useEffect(() => {
    if (!mounted) return;
    const tick = async () => {
      const dirty = editSeq.current !== savedSeq.current;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName ?? "",
      );
      try {
        const res = await fetch(`/api/plan?room=${room.current}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as ApiResp;
        if (!data.ok) return;
        setSync((s) => (s === "offline" ? "synced" : s));
        if (data.doc && data.doc.rev !== revRef.current) {
          if (dirty || typing) return; // 别打断正在改的人
          setPlan(data.doc.plan);
          revRef.current = data.doc.rev;
          savedSeq.current = editSeq.current;
          setSync("updated");
          flash("已同步对方的修改 ✨");
          window.setTimeout(() => setSync("synced"), 1500);
        }
      } catch {
        setSync("offline");
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [mounted, flash]);

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
