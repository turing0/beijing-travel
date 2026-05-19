export interface Activity {
  id: string;
  start: string; // "09:40"
  end?: string; // "11:00"
  title: string;
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
