export type Category =
  | "flight"
  | "hotel"
  | "food"
  | "movie"
  | "perfume"
  | "pottery"
  | "perler"
  | "sightseeing"
  | "free";

export interface Activity {
  id: string;
  start: string; // "09:40"
  end?: string; // "11:00"
  title: string;
  category: Category;
  location?: string;
  notes?: string;
  agreed?: boolean; // 两个人都确认了
}

export interface Day {
  id: string;
  date: string; // "2026-05-29"
  label: string; // "5月29日"
  weekday: string; // "周五"
  tag: string; // "抵达日"
  items: Activity[];
}

export interface Plan {
  title: string;
  subtitle: string;
  days: Day[];
}

export const CATEGORY_META: Record<
  Category,
  { label: string; emoji: string; chip: string; ring: string }
> = {
  flight: {
    label: "航班",
    emoji: "✈️",
    chip: "bg-sky-100 text-sky-700",
    ring: "border-sky-200",
  },
  hotel: {
    label: "住宿",
    emoji: "🏨",
    chip: "bg-slate-100 text-slate-700",
    ring: "border-slate-200",
  },
  food: {
    label: "吃饭",
    emoji: "🍜",
    chip: "bg-amber-100 text-amber-700",
    ring: "border-amber-200",
  },
  movie: {
    label: "看电影",
    emoji: "🎬",
    chip: "bg-indigo-100 text-indigo-700",
    ring: "border-indigo-200",
  },
  perfume: {
    label: "调香",
    emoji: "🌸",
    chip: "bg-rose-100 text-rose-700",
    ring: "border-rose-200",
  },
  pottery: {
    label: "陶艺",
    emoji: "🏺",
    chip: "bg-orange-100 text-orange-700",
    ring: "border-orange-200",
  },
  perler: {
    label: "拼豆",
    emoji: "🧩",
    chip: "bg-emerald-100 text-emerald-700",
    ring: "border-emerald-200",
  },
  sightseeing: {
    label: "游览",
    emoji: "🌇",
    chip: "bg-teal-100 text-teal-700",
    ring: "border-teal-200",
  },
  free: {
    label: "自由活动",
    emoji: "💫",
    chip: "bg-fuchsia-100 text-fuchsia-700",
    ring: "border-fuchsia-200",
  },
};

export const CATEGORY_ORDER: Category[] = [
  "flight",
  "hotel",
  "food",
  "movie",
  "perfume",
  "pottery",
  "perler",
  "sightseeing",
  "free",
];
