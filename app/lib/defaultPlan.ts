import type { Plan } from "./types";

// 一个稳定的 id 生成器（示例行程用固定 id，方便对比与分享）
let n = 0;
const id = () => `seed-${n++}`;

const WK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 示例行程的日期永远从「两周后」开始，避免示例里出现早已过去的日期
function sampleDates(count: number) {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const p = (x: number) => String(x).padStart(2, "0");
  return Array.from({ length: count }, (_, i) => {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    return {
      date: `${cur.getFullYear()}-${p(cur.getMonth() + 1)}-${p(cur.getDate())}`,
      label: `${cur.getMonth() + 1}月${cur.getDate()}日`,
      weekday: WK[cur.getDay()],
    };
  });
}

const [d1, d2, d3] = sampleDates(3);

// 一份通用的三日示例行程：展示时间、地点、备注、确认等玩法，内容自己随意替换
export const DEFAULT_PLAN: Plan = {
  title: "三日小旅行 · 示例行程",
  subtitle: `${d1.label} ${d1.weekday} — ${d3.label} ${d3.weekday} · 一起把每一格填满吧`,
  checklist: [
    { id: id(), text: "身份证 / 护照等证件", done: false },
    { id: id(), text: "充电宝、充电线", done: false },
    { id: id(), text: "确认往返车票 / 机票时间", done: false },
    { id: id(), text: "热门景点、餐厅提前预约", done: false },
  ],
  days: [
    {
      id: "day-1",
      date: d1.date,
      label: d1.label,
      weekday: d1.weekday,
      items: [
        {
          id: id(),
          start: "10:00",
          title: "抵达目的地",
          location: "机场 / 车站",
          notes: "落地后碰头，或约好酒店见。",
        },
        {
          id: id(),
          start: "11:00",
          end: "11:45",
          title: "酒店放行李 / 简单收拾",
          notes: "不能提前入住就先寄存行李。",
        },
        {
          id: id(),
          start: "12:00",
          end: "13:30",
          title: "午餐 · 尝尝本地菜",
          notes: "在备注里贴几家候选餐厅，一起挑。",
        },
        {
          id: id(),
          start: "14:30",
          end: "17:00",
          title: "逛老城区 / 特色街区",
          location: "待定",
          notes: "慢慢走慢慢逛，看到喜欢的店就进。",
          agreed: false,
        },
        {
          id: id(),
          start: "18:30",
          end: "20:00",
          title: "晚餐",
        },
      ],
    },
    {
      id: "day-2",
      date: d2.date,
      label: d2.label,
      weekday: d2.weekday,
      items: [
        {
          id: id(),
          start: "10:00",
          end: "11:00",
          title: "早午餐 Brunch",
          notes: "不用起太早，睡饱了再出门。",
        },
        {
          id: id(),
          start: "11:30",
          end: "14:00",
          title: "重点景点 / 博物馆",
          location: "待定",
          notes: "把最想去的放在这天，记得提前订票。",
          agreed: false,
        },
        {
          id: id(),
          start: "15:00",
          end: "17:00",
          title: "体验活动",
          location: "待定",
          notes: "陶艺、手作、citywalk……选一个都感兴趣的，需要预约。",
          agreed: false,
        },
        {
          id: id(),
          start: "17:30",
          end: "19:00",
          title: "看日落 / 散步",
          notes: "找个视野好的地方，看当天天气定。",
        },
        {
          id: id(),
          start: "19:30",
          end: "21:30",
          title: "正式一点的晚餐",
          notes: "这一顿好好吃，提前订位，挑个有氛围的地方。",
          agreed: false,
        },
      ],
    },
    {
      id: "day-3",
      date: d3.date,
      label: d3.label,
      weekday: d3.weekday,
      items: [
        {
          id: id(),
          start: "10:00",
          end: "11:00",
          title: "一起吃早餐",
          notes: "慢慢吃，不赶时间。",
        },
        {
          id: id(),
          start: "11:30",
          end: "13:00",
          title: "自由活动 / 逛街",
          notes: "买点小礼物、带点特产，留个纪念。",
        },
        {
          id: id(),
          start: "13:00",
          end: "14:30",
          title: "午餐",
        },
        {
          id: id(),
          start: "16:00",
          title: "取行李，出发去机场 / 车站",
          notes: "按航班或车次时间倒推，留够路上的时间。",
        },
        {
          id: id(),
          start: "19:00",
          title: "踏上归途 · 旅程结束",
          notes: "到家互相报个平安，顺便约下一次。",
        },
      ],
    },
  ],
};
