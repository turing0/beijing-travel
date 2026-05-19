import type { Day, Plan } from "./types";

const WK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 把 "YYYY-MM-DD" 按本地日期解析（避免时区把日期算错一天）
function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function label(dt: Date): string {
  return `${dt.getMonth() + 1}月${dt.getDate()}日`;
}

// 根据城市 + 起止日期生成一份空白行程（每天没有活动，自己往里加）
export function createPlan(city: string, start: string, end: string): Plan {
  const s = parseYMD(start);
  const e = parseYMD(end);
  const days: Day[] = [];
  const cur = new Date(s);
  let i = 0;
  while (cur.getTime() <= e.getTime() && i < 60) {
    days.push({
      id: `day-${i + 1}`,
      date: toYMD(cur),
      label: label(cur),
      weekday: WK[cur.getDay()],
      tag: "",
      items: [],
    });
    cur.setDate(cur.getDate() + 1);
    i++;
  }
  if (days.length === 1) {
    days[0].tag = "当天";
  } else if (days.length > 1) {
    days[0].tag = "抵达日";
    days[days.length - 1].tag = "离开日";
    for (let k = 1; k < days.length - 1; k++) days[k].tag = "游玩日";
  }

  const n = days.length;
  const first = days[0];
  const last = days[n - 1];
  const title = `${city}${n}日 · 我们的行程`;
  const subtitle =
    n > 1
      ? `${first.label} ${first.weekday} — ${last.label} ${last.weekday} · 一起把每一格填满吧`
      : `${first.label} ${first.weekday} · 一起把每一格填满吧`;

  return { title, subtitle, days };
}
