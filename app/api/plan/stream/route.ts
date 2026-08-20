import { readDoc, subscribeChanges } from "../../../lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel 上函数到时会被回收；到 55s 主动优雅关闭，浏览器端会自动重连
export const maxDuration = 60;

const STREAM_LIFETIME = 55_000;
const PING_INTERVAL = 20_000;

// SSE：把房间的行程变更实时推给客户端。
// 事件：doc（完整文档 JSON）、ping（心跳，客户端用来判断连接是否还活着）。
export async function GET(req: Request) {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") || "default";
  const knownRev = Number(url.searchParams.get("rev")) || 0;
  const encoder = new TextEncoder();
  const abort = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastRev = knownRev;

      const close = () => {
        if (closed) return;
        closed = true;
        abort.abort();
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      };
      const send = (event: string, data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          close();
        }
      };
      const pushLatest = async () => {
        try {
          const doc = await readDoc(room);
          if (doc && doc.rev > lastRev) {
            lastRev = doc.rev;
            send("doc", JSON.stringify(doc));
          }
        } catch {
          /* 这一轮读失败就算了，下次通知再试 */
        }
      };

      const ping = setInterval(() => send("ping", String(Date.now())), PING_INTERVAL);
      const lifetime = setTimeout(close, STREAM_LIFETIME);
      abort.signal.addEventListener("abort", () => {
        clearInterval(ping);
        clearTimeout(lifetime);
      });
      req.signal.addEventListener("abort", close);

      try {
        // 先订阅、再补发一次最新文档，保证「订阅生效前的空档」不漏更新；
        // 上游订阅断了就直接关掉本连接，让客户端重连重建。
        await subscribeChanges(room, abort.signal, pushLatest, close);
      } catch {
        // 订阅起不来（例如 Upstash 波动）：仍补发一次，然后关闭让客户端稍后重试
        await pushLatest();
        close();
        return;
      }
      await pushLatest();
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
