// 服务器端共享存储：线上用 Upstash Redis，本地没配密钥时退回到本地文件，
// 这样本地开发不用注册任何东西也能测试实时同步。
// 注意：此文件只在 Route Handler（服务器）里引用，不要在客户端组件里 import。
import { promises as fs } from "fs";
import path from "path";
import type { Plan } from "./types";

export interface StoredDoc {
  plan: Plan;
  rev: number; // 每次保存递增（用毫秒时间戳）
  updatedAt: string;
}

// 历史遗留的存储 key 前缀：改名会让 Redis 里已有房间的数据读不到，保持原值
const KEY_PREFIX = "beijing-plan:";
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

function safeRoom(room: string): string {
  const r = (room || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return r || "default";
}

/* ---------- Upstash 实现 ---------- */
let redisClient: import("@upstash/redis").Redis | null = null;
async function upstash() {
  if (!redisClient) {
    const { Redis } = await import("@upstash/redis");
    redisClient = Redis.fromEnv();
  }
  return redisClient;
}

async function upstashRead(room: string): Promise<StoredDoc | null> {
  const redis = await upstash();
  return (await redis.get<StoredDoc>(KEY_PREFIX + room)) ?? null;
}

async function upstashWrite(room: string, doc: StoredDoc): Promise<void> {
  const redis = await upstash();
  await redis.set(KEY_PREFIX + room, doc);
}

// 房间的变更通知频道（pub/sub 的频道和普通 key 不冲突）
const channel = (room: string) => `${KEY_PREFIX}notify:${room}`;

// 通过 Upstash 的 REST SSE 接口订阅频道；收到消息就调 onChange。
// 返回时订阅已生效（等到了 "subscribe" 确认行），中途断开会调 onEnd。
async function upstashSubscribe(
  room: string,
  signal: AbortSignal,
  onChange: () => void,
  onEnd: () => void,
): Promise<void> {
  const res = await fetch(
    `${process.env.UPSTASH_REDIS_REST_URL}/subscribe/${encodeURIComponent(
      channel(room),
    )}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        Accept: "text/event-stream",
      },
      cache: "no-store",
      signal,
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`subscribe failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  // 逐行读 SSE：data: subscribe,<频道>,<数量> / data: message,<频道>,<内容>
  const readLine = async (): Promise<string | null> => {
    for (;;) {
      const idx = buf.indexOf("\n");
      if (idx >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) return line;
        continue;
      }
      const { value, done } = await reader.read();
      if (done) return null;
      buf += decoder.decode(value, { stream: true });
    }
  };

  // 等订阅确认，避免「先读文档、订阅还没生效」的空档漏掉更新
  for (;;) {
    const line = await readLine();
    if (line === null) throw new Error("subscribe stream closed early");
    if (line.startsWith("data: subscribe,")) break;
  }

  // 后台继续收消息
  void (async () => {
    try {
      for (;;) {
        const line = await readLine();
        if (line === null) break;
        if (line.startsWith("data: message,")) onChange();
      }
    } catch {
      /* signal 中止或连接断开 */
    }
    onEnd();
  })();
}

// 文件模式没有 pub/sub：低频轮询本地文件的 rev（本地开发，开销可忽略）
async function fileSubscribe(
  room: string,
  signal: AbortSignal,
  onChange: () => void,
): Promise<void> {
  let last = (await fileRead(room))?.rev ?? 0;
  const timer = setInterval(async () => {
    const doc = await fileRead(room);
    if (doc && doc.rev > last) {
      last = doc.rev;
      onChange();
    }
  }, 1500);
  signal.addEventListener("abort", () => clearInterval(timer));
  // 上面 await 期间就被中止的话，监听器不会再触发，这里补一次
  if (signal.aborted) clearInterval(timer);
}

/* ---------- 本地文件实现（仅本地开发用） ---------- */
const DATA_DIR = path.join(process.cwd(), ".data");

async function fileRead(room: string): Promise<StoredDoc | null> {
  try {
    const raw = await fs.readFile(
      path.join(DATA_DIR, `plan-${room}.json`),
      "utf8",
    );
    return JSON.parse(raw) as StoredDoc;
  } catch {
    return null;
  }
}

async function fileWrite(room: string, doc: StoredDoc): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, `plan-${room}.json`),
    JSON.stringify(doc, null, 2),
    "utf8",
  );
}

/* ---------- 对外接口 ---------- */
export async function readDoc(room: string): Promise<StoredDoc | null> {
  const r = safeRoom(room);
  return hasUpstash ? upstashRead(r) : fileRead(r);
}

export async function writeDoc(room: string, plan: Plan): Promise<StoredDoc> {
  const r = safeRoom(room);
  const doc: StoredDoc = {
    plan,
    rev: Date.now(),
    updatedAt: new Date().toISOString(),
  };
  if (hasUpstash) {
    await upstashWrite(r, doc);
    // 喊一声「这个房间变了」，让所有订阅的 SSE 连接去拉最新文档；
    // 通知失败不影响保存本身（客户端还有重连兜底）。
    try {
      const redis = await upstash();
      await redis.publish(channel(r), String(doc.rev));
    } catch {
      /* 忽略 */
    }
  } else {
    await fileWrite(r, doc);
  }
  return doc;
}

// 订阅某房间的变更通知；返回时订阅已生效，通过 signal 取消。
// 收到通知只表示「变了」，具体内容由调用方自己 readDoc。
export async function subscribeChanges(
  room: string,
  signal: AbortSignal,
  onChange: () => void,
  onEnd: () => void,
): Promise<void> {
  const r = safeRoom(room);
  if (hasUpstash) await upstashSubscribe(r, signal, onChange, onEnd);
  else await fileSubscribe(r, signal, onChange);
}

export const storageMode = hasUpstash ? "upstash" : "file";
