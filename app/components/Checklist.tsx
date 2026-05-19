"use client";

import type { ChecklistItem } from "../lib/types";

interface Props {
  items: ChecklistItem[];
  onAdd: () => void;
  onToggle: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

export default function Checklist({
  items,
  onAdd,
  onToggle,
  onChangeText,
  onDelete,
}: Props) {
  const doneCount = items.filter((i) => i.done).length;

  return (
    <section className="mt-8 rounded-2xl bg-white/70 p-5 shadow-sm backdrop-blur">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-stone-800">📝 注意事项 / 备忘</h2>
        {items.length > 0 && (
          <span className="text-xs font-medium text-stone-400">
            {doneCount} / {items.length} 已完成
          </span>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-stone-50"
          >
            <button
              onClick={() => onToggle(item.id)}
              aria-label={item.done ? "标记为未完成" : "标记为已完成"}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                item.done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-stone-300 text-transparent hover:border-emerald-400"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </button>

            <input
              value={item.text}
              onChange={(e) => onChangeText(item.id, e.target.value)}
              placeholder="要带什么 / 别忘了…"
              className={`min-w-0 flex-1 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-300 ${
                item.done ? "text-stone-400 line-through" : ""
              }`}
            />

            <button
              onClick={() => onDelete(item.id)}
              aria-label="删除这一条"
              title="删除这一条"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-stone-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
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
          </li>
        ))}
      </ul>

      <button
        onClick={onAdd}
        className="mt-3 w-full rounded-xl border-2 border-dashed border-stone-300 py-2.5 text-sm font-medium text-stone-400 transition hover:border-rose-300 hover:text-rose-500"
      >
        + 加一条
      </button>
    </section>
  );
}
