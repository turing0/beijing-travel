"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPlan } from "./lib/createPlan";
import { seedKey } from "./lib/usePlanSync";

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
    const m = new URL(s).pathname.match(/\/trip\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
  } catch {
    /* 不是完整链接，继续往下判断 */
  }
  const m = s.match(/(?:room=|\/trip\/)([A-Za-z0-9_-]+)/);
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

export default function Home() {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [createInput, setCreateInput] = useState("");
  const [city, setCity] = useState("北京");
  const [startDate, setStartDate] = useState("2026-05-29");
  const [endDate, setEndDate] = useState("2026-05-31");
  const [redirecting, setRedirecting] = useState(false);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }

  // 兼容旧的 /?room=xxx 链接：直接转到 /trip/xxx
  useEffect(() => {
    const r = new URL(window.location.href).searchParams.get("room");
    if (r) {
      setRedirecting(true);
      router.replace(`/trip/${encodeURIComponent(r)}`);
    }
  }, [router]);

  function tryCreate() {
    const c = city.trim() || "北京";
    if (!startDate || !endDate) {
      flash("选一下开始和结束日期");
      return;
    }
    if (startDate > endDate) {
      flash("结束日期不能早于开始日期");
      return;
    }
    const span =
      Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) /
          86400000,
      ) + 1;
    if (span > 30) {
      flash("行程最长 30 天哦");
      return;
    }
    const raw = createInput.trim();
    const code = raw ? sanitizeRoom(raw) : newRoomCode();
    if (!code) {
      flash("房间号只能用字母、数字、- 和 _");
      return;
    }
    try {
      sessionStorage.setItem(
        seedKey(code),
        JSON.stringify(createPlan(c, startDate, endDate)),
      );
    } catch {
      /* sessionStorage 不可用就算了，房间会退回示例行程 */
    }
    router.push(`/trip/${code}`);
  }

  function tryJoin() {
    const r = parseRoom(joinInput);
    if (!r) {
      flash("没认出来，贴邀请链接或填房间号");
      return;
    }
    router.push(`/trip/${encodeURIComponent(r)}`);
  }

  if (redirecting) {
    return (
      <main className="flex min-h-full items-center justify-center bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50 px-4">
        <p className="text-sm text-stone-400">正在打开行程…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <span className="rounded-full bg-rose-500 px-3 py-1 text-sm font-medium text-white">
            两个人一起做的旅行计划
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-800">
            我们的旅行行程
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            选好城市和日期生成行程，两个人一起安排，实时同步
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm">
            <div className="text-base font-semibold text-stone-800">
              ✨ 新建一个行程
            </div>
            <div className="mt-0.5 text-sm text-stone-500">
              填城市和日期，自动按天数生成空白行程，你俩再一起往里加。
            </div>

            <label className="mt-3 block text-xs font-medium text-stone-500">
              城市
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="去哪个城市"
                className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-stone-800"
              />
            </label>

            <div className="mt-3 flex gap-2">
              <label className="flex-1 text-xs font-medium text-stone-500">
                出发
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-stone-800"
                />
              </label>
              <label className="flex-1 text-xs font-medium text-stone-500">
                返回
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-stone-800"
                />
              </label>
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
              房间号只能用字母、数字、- 和 _，留空随机生成；已存在则直接打开它。
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
          进入后网址就是 /trip/房间号，刷新、换设备只要打开同一个链接就行
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
