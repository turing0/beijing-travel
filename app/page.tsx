"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActivityCard from "./components/ActivityCard";
import { DEFAULT_PLAN } from "./lib/defaultPlan";
import { decodePlan, encodePlan, planToText } from "./lib/share";
import type { Activity, Day, Plan } from "./lib/types";

const STORAGE_KEY = "beijing-plan-v1";
const TRIP_START = new Date("2026-05-29T00:00:00");

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export default function Home() {
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [mounted, setMounted] = useState(false);
  const [fromShare, setFromShare] = useState(false);
  const [toast, setToast] = useState("");
  const [editingHeader, setEditingHeader] = useState(false);
  const hydrated = useRef(false);

  // 加载顺序：分享链接 > 本设备保存 > 默认行程
  useEffect(() => {
    let loaded: Plan | null = null;
    const hash = window.location.hash;
    if (hash.startsWith("#plan=")) {
      loaded = decodePlan(decodeURIComponent(hash.slice(6)));
      if (loaded) setFromShare(true);
    }
    if (!loaded) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) loaded = JSON.parse(saved) as Plan;
      } catch {
        /* 忽略损坏的本地数据 */
      }
    }
    if (loaded && Array.isArray(loaded.days)) setPlan(loaded);
    hydrated.current = true;
    setMounted(true);
  }, []);

  // 自动保存到本设备
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      /* 存储空间不足时静默失败 */
    }
  }, [plan]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const daysLeft = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const ms = TRIP_START.getTime() - now.getTime();
    return Math.round(ms / 86400000);
  }, []);

  function mutateDay(dayId: string, fn: (items: Activity[]) => Activity[]) {
    setPlan((p) => ({
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

  function shareLink() {
    const url = `${window.location.origin}${window.location.pathname}#plan=${encodePlan(plan)}`;
    copy(url, "分享链接已复制，发给她就能一起改～");
  }

  function resetPlan() {
    if (confirm("确定要恢复成默认行程吗？当前的修改会被覆盖。")) {
      setPlan(clone(DEFAULT_PLAN));
      flash("已恢复默认行程");
    }
  }

  const totalAgreed = plan.days
    .flatMap((d) => d.items)
    .filter((i) => i.agreed).length;
  const totalItems = plan.days.flatMap((d) => d.items).length;

  return (
    <main className="min-h-full bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* 头部 */}
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
          </div>

          {editingHeader ? (
            <div className="mx-auto max-w-xl space-y-2">
              <input
                value={plan.title}
                onChange={(e) =>
                  setPlan((p) => ({ ...p, title: e.target.value }))
                }
                className="w-full rounded-lg border border-rose-200 px-3 py-2 text-center text-2xl font-bold text-stone-800"
              />
              <input
                value={plan.subtitle}
                onChange={(e) =>
                  setPlan((p) => ({ ...p, subtitle: e.target.value }))
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
              已确认 {totalAgreed} / {totalItems} 项 · 修改会自动保存在这台设备上
            </p>
          )}
        </header>

        {/* 分享提示 */}
        {fromShare && (
          <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-rose-200 bg-white/70 px-4 py-3 text-center text-sm text-stone-600">
            你正在看一份分享来的行程 ✨ 直接改就行，改完点「复制分享链接」发回去。
          </div>
        )}

        {/* 工具栏 */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={shareLink}
            className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
          >
            🔗 复制分享链接
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

        {/* 三天行程 */}
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

      {/* 提示条 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
