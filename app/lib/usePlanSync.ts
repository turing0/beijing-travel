"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PLAN } from "./defaultPlan";
import type { Plan } from "./types";

const CACHE_KEY = "beijing-plan-cache-v1";
const SAVE_DEBOUNCE = 700;
const POLL_FAST = 5000; // 刚有人改动后的一段时间，拉得勤一点
const POLL_SLOW = 20000; // 没人动时放慢，省请求和电量
const ACTIVE_WINDOW = 60000; // 最后一次改动后 1 分钟内算“活跃”

export type SyncState =
  | "loading"
  | "synced"
  | "saving"
  | "updated"
  | "offline";

interface ApiResp {
  ok: boolean;
  doc: { plan: Plan; rev: number; updatedAt: string } | null;
}

// 新建行程时把生成的行程暂存在这里，跳到 /trip/<id> 后由这里取出来当初始数据
export const seedKey = (id: string) => `trip-seed:${id}`;

export function usePlanSync(roomId: string, flash: (m: string) => void) {
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [sync, setSync] = useState<SyncState>("loading");

  const room = useRef(roomId);
  room.current = roomId;
  const revRef = useRef(0);
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const planRef = useRef(plan);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivity = useRef(Date.now());
  const polling = useRef(false);
  planRef.current = plan;

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

  // 拉取这个房间的行程；房间还没数据就用新建时暂存的行程，没有则退回北京示例
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSync("loading");
      try {
        const res = await fetch(`/api/plan?room=${roomId}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as ApiResp;
        if (cancelled) return;
        if (data.ok && data.doc) {
          try {
            sessionStorage.removeItem(seedKey(roomId));
          } catch {
            /* 忽略 */
          }
          setPlan(data.doc.plan);
          planRef.current = data.doc.plan;
          revRef.current = data.doc.rev;
          savedSeq.current = editSeq.current;
          setSync("synced");
        } else {
          let seed: Plan = DEFAULT_PLAN;
          try {
            const s = sessionStorage.getItem(seedKey(roomId));
            if (s) seed = JSON.parse(s) as Plan;
            sessionStorage.removeItem(seedKey(roomId));
          } catch {
            /* 忽略 */
          }
          setPlan(seed);
          planRef.current = seed;
          await doSave();
        }
      } catch {
        if (cancelled) return;
        try {
          const c = localStorage.getItem(CACHE_KEY);
          if (c) setPlan(JSON.parse(c) as Plan);
        } catch {
          /* 忽略损坏的缓存 */
        }
        setSync("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, doSave]);

  // 自适应轮询：活跃 5s、空闲 20s；后台暂停，回前台立刻拉一次；
  // 本地有未保存改动 / 正在输入时先不覆盖。
  useEffect(() => {
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
            lastActivity.current = Date.now();
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
      if (stopped || document.hidden) return;
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
        await poll();
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

  return { plan, sync, commit };
}
