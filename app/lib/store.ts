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

const KEY_PREFIX = "beijing-plan:";
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

function safeRoom(room: string): string {
  const r = (room || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return r || "default";
}

/* ---------- Upstash 实现 ---------- */
async function upstash() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

async function upstashRead(room: string): Promise<StoredDoc | null> {
  const redis = await upstash();
  return (await redis.get<StoredDoc>(KEY_PREFIX + room)) ?? null;
}

async function upstashWrite(room: string, doc: StoredDoc): Promise<void> {
  const redis = await upstash();
  await redis.set(KEY_PREFIX + room, doc);
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
  if (hasUpstash) await upstashWrite(r, doc);
  else await fileWrite(r, doc);
  return doc;
}

export const storageMode = hasUpstash ? "upstash" : "file";
