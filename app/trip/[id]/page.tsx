"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import LoadingScreen from "../../components/LoadingScreen";
import Planner from "../../components/Planner";
import { DEFAULT_PLAN } from "../../lib/defaultPlan";
import { planToText } from "../../lib/share";
import type { Activity, Day, Plan } from "../../lib/types";
import { type SyncState, usePlanSync } from "../../lib/usePlanSync";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

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

export default function TripPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;

  const [toast, setToast] = useState("");
  const [editingHeader, setEditingHeader] = useState(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const { plan, sync, commit, notFound } = usePlanSync(roomId, flash);

  const daysLeft = useMemo(() => {
    const first = plan.days[0]?.date;
    if (!first) return null;
    const [y, m, d] = first.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / 86400000);
  }, [plan.days]);

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
      },
    ]);

  const reorderDays = (newDays: Day[]) =>
    commit((p) => ({ ...p, days: newDays }));

  async function copy(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(okMsg);
    } catch {
      flash("复制失败，请手动复制");
    }
  }

  function resetPlan() {
    if (
      confirm(
        "载入北京示例行程（陶艺/调香/拼豆/看电影那套）？当前内容会被覆盖，对方那边也会变。",
      )
    ) {
      commit(() => clone(DEFAULT_PLAN) as Plan);
      flash("已载入北京示例行程");
    }
  }

  if (notFound) {
    return (
      <main className="flex min-h-full items-center justify-center bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50 px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl">🧭</div>
          <h1 className="mt-4 text-2xl font-bold text-stone-800">
            没找到这个行程
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            房间号
            <span className="mx-1 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-stone-700">
              {roomId}
            </span>
            还不存在。可能是链接打错了，或对方还没创建。
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
          >
            回首页 · 新建或重新输入
          </Link>
        </div>
      </main>
    );
  }

  if (sync === "loading") {
    return <LoadingScreen />;
  }

  const totalAgreed = plan.days
    .flatMap((d) => d.items)
    .filter((i) => i.agreed).length;
  const totalItems = plan.days.flatMap((d) => d.items).length;

  return (
    <main className="min-h-full bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <header className="text-center">
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="rounded-full bg-rose-500 px-3 py-1 font-medium text-white">
              共 {plan.days.length} 天
              {plan.days.length > 1 ? ` ${plan.days.length - 1} 晚` : ""}
            </span>
            {daysLeft !== null && daysLeft > 0 && (
              <span className="rounded-full bg-white px-3 py-1 font-medium text-rose-600 shadow-sm">
                还有 {daysLeft} 天出发
              </span>
            )}
            {daysLeft === 0 && (
              <span className="rounded-full bg-white px-3 py-1 font-medium text-rose-600 shadow-sm">
                就是今天，出发！
              </span>
            )}
            <span
              className={`rounded-full px-3 py-1 font-medium ${syncColor[sync]}`}
            >
              {sync === "synced" ? "● " : ""}
              {syncLabel[sync]}
            </span>
          </div>

          {editingHeader ? (
            <div className="mx-auto max-w-xl space-y-2">
              <input
                value={plan.title}
                onChange={(e) => commit((p) => ({ ...p, title: e.target.value }))}
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

          {totalItems > 0 && (
            <p className="mt-3 text-xs text-stone-400">
              已确认 {totalAgreed} / {totalItems} 项
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
            ↺ 载入北京示例
          </button>
        </div>

        <Planner
          days={plan.days}
          onReorder={reorderDays}
          onActivityChange={updateActivity}
          onActivityDelete={deleteActivity}
          onActivityAdd={addActivity}
          onActivityMove={moveActivity}
        />

        <p className="mt-4 text-center text-xs text-stone-400">
          提示：按住卡片左边的时间（⠿）就能拖动，可在同一天内排序，也能拖到别的天
        </p>

        <footer className="mt-12 text-center text-xs text-stone-400">
          祝你们玩得开心 · 行程随时一起改
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
