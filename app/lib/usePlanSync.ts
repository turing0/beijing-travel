"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PLAN } from "./defaultPlan";
import type { Plan } from "./types";

// 每个房间各存一份本地缓存，断网时兜底显示，不会串到别的房间
const cacheKey = (id: string) => `trip-plan-cache:${id}`;
const SAVE_DEBOUNCE = 700;
const RECONNECT_BASE = 2000; // SSE 断开后的重连起始间隔（按失败次数放大）
const RETRY_APPLY = 1500; // 正在输入 / 有未保存改动时，稍后再套用对方的更新
const STALE_AFTER = 50000; // 超过这个时间没收到任何事件（含心跳）就视为连接已死

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

// 老数据可能没有 checklist 字段，补齐避免读取时报错
function normalizePlan(p: Plan): Plan {
  return Array.isArray(p?.checklist) ? p : { ...p, checklist: [] };
}

// 新建行程时把生成的行程暂存在这里，跳到 /trip/<id> 后由这里取出来当初始数据
export const seedKey = (id: string) => `trip-seed:${id}`;

export function usePlanSync(roomId: string, flash: (m: string) => void) {
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [sync, setSync] = useState<SyncState>("loading");
  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false); // 首次加载完成后才建立 SSE 连接

  const room = useRef(roomId);
  const revRef = useRef(0);
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const planRef = useRef(plan);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保持 ref 跟随最新值（供 doSave / SSE 回调等异步场景读取）
  useEffect(() => {
    room.current = roomId;
  }, [roomId]);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

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
      setPlan((p) => {
        const next = updater(p);
        try {
          localStorage.setItem(cacheKey(room.current), JSON.stringify(next));
        } catch {
          /* 忽略 */
        }
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  // 拉取这个房间的行程；房间还没数据就用新建时暂存的行程，没有则提示不存在
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
          const p = normalizePlan(data.doc.plan);
          setPlan(p);
          planRef.current = p;
          revRef.current = data.doc.rev;
          savedSeq.current = editSeq.current;
          setSync("synced");
          setLoaded(true);
        } else {
          // 房间没数据：只有「新建」流程暂存了 seed 才创建；
          // 否则说明这个房间号根本不存在（直接打开了无效链接），提示不存在。
          let seed: Plan | null = null;
          try {
            const s = sessionStorage.getItem(seedKey(roomId));
            if (s) seed = JSON.parse(s) as Plan;
            sessionStorage.removeItem(seedKey(roomId));
          } catch {
            /* 忽略 */
          }
          if (!seed) {
            setNotFound(true);
            return;
          }
          seed = normalizePlan(seed);
          setPlan(seed);
          planRef.current = seed;
          await doSave();
          setLoaded(true);
        }
      } catch {
        if (cancelled) return;
        try {
          const c = localStorage.getItem(cacheKey(roomId));
          if (c) setPlan(normalizePlan(JSON.parse(c) as Plan));
        } catch {
          /* 忽略损坏的缓存 */
        }
        setSync("offline");
        setLoaded(true); // 让 SSE 去重试，连上后会自动恢复
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, doSave]);

  // 实时同步：SSE 长连接，服务端一有变更就推过来（秒级）。
  // 断线自动重连；页面切后台就断开省电，回前台重连并补拉；
  // 正在输入 / 有未保存改动时先不覆盖，稍后再套用。
  useEffect(() => {
    if (!loaded || notFound) return;
    let es: EventSource | null = null;
    let stopped = false;
    let failures = 0;
    let lastEventAt = Date.now();
    let reconnectTimer: number | null = null;
    let retryTimer: number | null = null;
    let pending: { plan: Plan; rev: number } | null = null;

    const alive = () => {
      failures = 0;
      lastEventAt = Date.now();
    };

    const tryApply = (doc: { plan: Plan; rev: number } | null) => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      // rev 是服务器时间戳，只接受比本地新的（旧的可能是我们保存前的快照）
      if (!doc || doc.rev <= revRef.current) {
        pending = null;
        return;
      }
      const dirty = editSeq.current !== savedSeq.current;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName ?? "",
      );
      if (dirty || typing) {
        pending = doc;
        retryTimer = window.setTimeout(() => tryApply(pending), RETRY_APPLY);
        return;
      }
      pending = null;
      setPlan(normalizePlan(doc.plan));
      revRef.current = doc.rev;
      savedSeq.current = editSeq.current;
      setSync("updated");
      flash("已同步对方的修改 ✨");
      window.setTimeout(() => setSync("synced"), 1500);
    };

    const disconnect = () => {
      es?.close();
      es = null;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (stopped || document.hidden) return;
      if (es && es.readyState !== EventSource.CLOSED) return;
      es = new EventSource(
        `/api/plan/stream?room=${encodeURIComponent(room.current)}&rev=${
          revRef.current
        }`,
      );
      es.addEventListener("doc", (e: MessageEvent) => {
        alive();
        try {
          tryApply(JSON.parse(e.data));
        } catch {
          /* 忽略坏数据 */
        }
      });
      es.addEventListener("ping", alive);
      es.onopen = () => {
        alive();
        setSync((s) => (s === "offline" ? "synced" : s));
        // 断线期间的本地改动，重连后补一次保存
        if (editSeq.current !== savedSeq.current) scheduleSave();
      };
      es.onerror = () => {
        disconnect();
        failures += 1;
        // 服务端 55s 周期性收尾也会走到这里，所以连续失败两次才算断网
        if (failures >= 2) setSync((s) => (s === "saving" ? s : "offline"));
        reconnectTimer = window.setTimeout(
          connect,
          RECONNECT_BASE * Math.min(failures, 5),
        );
      };
    };

    // 兜底看门狗：长时间收不到任何事件（含心跳）说明连接已死，重建
    const watchdog = window.setInterval(() => {
      if (document.hidden || !es) return;
      if (Date.now() - lastEventAt > STALE_AFTER) {
        disconnect();
        connect();
      }
    }, 15000);

    const onVisibility = () => {
      if (document.hidden) {
        disconnect();
      } else {
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      stopped = true;
      disconnect();
      clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [roomId, flash, notFound, loaded, scheduleSave]);

  return { plan, sync, commit, notFound };
}
