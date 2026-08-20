import type { Plan } from "./types";

// UTF-8 安全的 base64（支持中文），用于把整份行程塞进分享链接里。
export function encodePlan(plan: Plan): string {
  const json = JSON.stringify(plan);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePlan(s: string): Plan | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Plan;
    if (!parsed || !Array.isArray(parsed.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function planToText(plan: Plan): string {
  const lines: string[] = [plan.title, plan.subtitle, ""];
  if (plan.checklist?.length) {
    lines.push("📝 注意事项 / 备忘");
    for (const c of plan.checklist) {
      lines.push(`  ${c.done ? "[✓]" : "[ ]"} ${c.text}`);
    }
    lines.push("");
  }
  for (const day of plan.days) {
    lines.push(`【${day.label} ${day.weekday}】`);
    for (const it of day.items) {
      const time = it.end ? `${it.start}-${it.end}` : it.start;
      const loc = it.location ? `（${it.location}）` : "";
      const ok = it.agreed ? " ✓已确认" : "";
      lines.push(`  ${time}  ${it.title || "未命名"}${loc}${ok}`);
      if (it.notes) lines.push(`        · ${it.notes}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
