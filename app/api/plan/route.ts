import { NextResponse } from "next/server";
import { readDoc, writeDoc } from "../../lib/store";
import type { Plan } from "../../lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function room(req: Request): string {
  return new URL(req.url).searchParams.get("room") || "default";
}

// 读取某个房间最新的行程
export async function GET(req: Request) {
  try {
    const doc = await readDoc(room(req));
    return NextResponse.json(
      { ok: true, doc },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}

// 保存整份行程（后写覆盖，适合两个人轮流改）
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { plan?: Plan };
    if (!body?.plan || !Array.isArray(body.plan.days)) {
      return NextResponse.json(
        { ok: false, error: "invalid plan" },
        { status: 400 },
      );
    }
    const doc = await writeDoc(room(req), body.plan);
    return NextResponse.json(
      { ok: true, doc },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
