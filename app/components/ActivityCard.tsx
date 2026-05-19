"use client";

import { useState } from "react";
import type { Activity } from "../lib/types";

interface Props {
  activity: Activity;
  isFirst: boolean;
  isLast: boolean;
  onChange: (a: Activity) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  dragRef?: (el: HTMLElement | null) => void;
  dragProps?: Record<string, unknown>;
}

export default function ActivityCard({
  activity,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMove,
  dragRef,
  dragProps,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<Activity>(activity);

  function startEdit() {
    setDraft(activity);
    setEditing(true);
  }

  function save() {
    onChange({ ...draft, title: draft.title.trim() || "未命名" });
    setEditing(false);
  }

  if (editing) {
    const set = (patch: Partial<Activity>) =>
      setDraft((d) => ({ ...d, ...patch }));
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2">
          <label className="flex-1 text-xs font-medium text-stone-500">
            开始
            <input
              type="time"
              value={draft.start}
              onChange={(e) => set({ start: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-800"
            />
          </label>
          <label className="flex-1 text-xs font-medium text-stone-500">
            结束（可选）
            <input
              type="time"
              value={draft.end ?? ""}
              onChange={(e) => set({ end: e.target.value || undefined })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-800"
            />
          </label>
        </div>

        <label className="mt-3 block text-xs font-medium text-stone-500">
          活动
          <input
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="想做点什么…"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-stone-500">
          地点（可选）
          <input
            value={draft.location ?? ""}
            onChange={(e) => set({ location: e.target.value || undefined })}
            placeholder="在哪儿见 / 哪家店"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-stone-500">
          备注（可选）
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || undefined })}
            placeholder="留言、想法、要提前订的东西…"
            rows={2}
            className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
          />
        </label>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onDelete}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            删除
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              取消
            </button>
            <button
              onClick={save}
              className="rounded-lg bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-600"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        activity.agreed ? "border-emerald-300" : "border-stone-200"
      }`}
    >
      <button
        onClick={() => setConfirming(true)}
        aria-label="删除这一项"
        title="删除这一项"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-stone-300 transition hover:bg-red-50 hover:text-red-500"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {confirming && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/95 px-4 text-center backdrop-blur-sm">
          <p className="text-sm text-stone-700">
            删除
            <span className="font-semibold text-stone-900">
              「{activity.title}」
            </span>
            ？
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              取消
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
            >
              删除
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 pr-6">
        <div
          ref={dragRef}
          {...dragProps}
          className={`shrink-0 text-right ${
            dragProps
              ? "cursor-grab touch-none select-none active:cursor-grabbing"
              : ""
          }`}
          title={dragProps ? "按住拖动" : undefined}
        >
          <div className="font-mono text-sm font-bold text-stone-800">
            {activity.start}
          </div>
          {activity.end && (
            <div className="font-mono text-xs text-stone-400">
              {activity.end}
            </div>
          )}
          {dragProps && (
            <div className="mt-1 text-sm leading-none text-stone-300">⠿</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-stone-800">{activity.title}</h3>
          {activity.location && (
            <p className="mt-0.5 text-sm text-stone-500">
              📍 {activity.location}
            </p>
          )}
          {activity.notes && (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
              {activity.notes}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1">
            <button
              onClick={() => onChange({ ...activity, agreed: !activity.agreed })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                activity.agreed
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              {activity.agreed ? "✓ 已确认" : "标记两人都同意"}
            </button>
            <button
              onClick={startEdit}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100"
            >
              编辑
            </button>
            <button
              onClick={() => onMove(-1)}
              disabled={isFirst}
              className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 disabled:opacity-30"
              aria-label="上移"
            >
              ↑
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={isLast}
              className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 disabled:opacity-30"
              aria-label="下移"
            >
              ↓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
