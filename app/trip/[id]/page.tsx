"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Checklist from "../../components/Checklist";
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
const syncDot: Record<SyncState, string> = {
  loading: "bg-stone-400",
  synced: "bg-emerald-500",
  saving: "bg-amber-500",
  updated: "bg-sky-500",
  offline: "bg-red-500",
};

export default function TripPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;

  const [toast, setToast] = useState("");
  const [editingHeader, setEditingHeader] = useState(false);
  // 刚新建的活动 / 备忘条目 id：让对应卡片直接展开编辑、输入框自动聚焦
  const [justAddedActivity, setJustAddedActivity] = useState<string | null>(
    null,
  );
  const [justAddedChecklist, setJustAddedChecklist] = useState<string | null>(
    null,
  );

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

  const updateActivity = (dayId: string, a: Activity) => {
    // 编辑保存后清掉“新建自动展开”标记，之后重挂载不再弹编辑态
    if (a.id === justAddedActivity) setJustAddedActivity(null);
    mutateDay(dayId, (items) => items.map((it) => (it.id === a.id ? a : it)));
  };

  const deleteActivity = (dayId: string, aid: string) =>
    mutateDay(dayId, (items) => items.filter((it) => it.id !== aid));

  const moveActivity = (dayId: string, idx: number, dir: -1 | 1) =>
    mutateDay(dayId, (items) => {
      const j = idx + dir;
      if (j < 0 || j >= items.length) return items;
      [items[idx], items[j]] = [items[j], items[idx]];
      return items;
    });

  const newId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `a-${Date.now()}`;

  const addActivity = (dayId: string) => {
    const id = newId();
    mutateDay(dayId, (items) => [
      ...items,
      { id, start: "12:00", title: "" },
    ]);
    setJustAddedActivity(id);
  };

  const reorderDays = (newDays: Day[]) => {
    // 拖拽（含跨天）会让卡片重挂载，清掉标记避免编辑表单意外复活
    setJustAddedActivity(null);
    commit((p) => ({ ...p, days: newDays }));
  };

  // 把某一天的活动按开始时间重排（sort 是稳定的，同一时间保持原有先后）
  const sortDay = (dayId: string) => {
    mutateDay(dayId, (items) =>
      items.sort((a, b) => (a.start || "").localeCompare(b.start || "")),
    );
    flash("已按开始时间排好 ⏱");
  };

  const addChecklistItem = () => {
    const id = newId();
    commit((p) => ({
      ...p,
      checklist: [...p.checklist, { id, text: "", done: false }],
    }));
    setJustAddedChecklist(id);
  };

  const toggleChecklistItem = (cid: string) =>
    commit((p) => ({
      ...p,
      checklist: p.checklist.map((c) =>
        c.id === cid ? { ...c, done: !c.done } : c,
      ),
    }));

  const changeChecklistText = (cid: string, text: string) =>
    commit((p) => ({
      ...p,
      checklist: p.checklist.map((c) =>
        c.id === cid ? { ...c, text } : c,
      ),
    }));

  const deleteChecklistItem = (cid: string) =>
    commit((p) => ({
      ...p,
      checklist: p.checklist.filter((c) => c.id !== cid),
    }));

  async function copy(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(okMsg);
    } catch {
      flash("复制失败，请手动复制");
    }
  }

  function resetPlan() {
    if (confirm("载入三日示例行程？可以在它的基础上随意修改。")) {
      commit(() => clone(DEFAULT_PLAN) as Plan);
      flash("已载入示例行程");
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
  const isEmpty = totalItems === 0 && plan.checklist.length === 0;

  return (
    <main className="min-h-full bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-12">
        <div className="-mt-4 mb-2 sm:-mt-6">
          <Link
            href="/"
            className="text-sm text-stone-400 transition hover:text-rose-500"
          >
            ← 首页
          </Link>
        </div>
        <header className="text-center">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-sm">
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
              aria-label={syncLabel[sync]}
              title={syncLabel[sync]}
              className={`inline-block h-2.5 w-2.5 rounded-full sm:hidden ${
                syncDot[sync]
              } ${
                sync === "saving" ? "animate-pulse" : ""
              }`}
            />
            <span
              className={`hidden rounded-full px-3 py-1 font-medium sm:inline-block ${syncColor[sync]}`}
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

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <button
            onClick={() =>
              copy(
                window.location.href,
                "链接已复制，发给同伴——你们改的就是同一份～",
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
          {isEmpty && (
            <button
              onClick={resetPlan}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-stone-500 shadow-sm hover:bg-stone-50"
            >
              ↺ 载入示例行程
            </button>
          )}
        </div>

        <Checklist
          items={plan.checklist}
          onAdd={addChecklistItem}
          onToggle={toggleChecklistItem}
          onChangeText={changeChecklistText}
          onDelete={deleteChecklistItem}
          focusId={justAddedChecklist}
        />

        <Planner
          days={plan.days}
          onReorder={reorderDays}
          onActivityChange={updateActivity}
          onActivityDelete={deleteActivity}
          onActivityAdd={addActivity}
          onActivityMove={moveActivity}
          onDaySort={sortDay}
          autoEditId={justAddedActivity}
        />

        <p className="mt-6 text-center text-xs leading-relaxed text-stone-400">
          提示：按住卡片左边的时间（⠿）就能拖动，可在同一天内排序，也能拖到别的天
        </p>

        <footer className="mt-14 text-center text-xs text-stone-400">
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
