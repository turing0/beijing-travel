"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ActivityCard from "./ActivityCard";
import type { Activity, Day } from "../lib/types";

interface Props {
  days: Day[];
  onReorder: (days: Day[]) => void;
  onActivityChange: (dayId: string, a: Activity) => void;
  onActivityDelete: (dayId: string, id: string) => void;
  onActivityAdd: (dayId: string) => void;
  onActivityMove: (dayId: string, idx: number, dir: -1 | 1) => void;
}

function SortableActivity({
  activity,
  dayId,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMove,
}: {
  activity: Activity;
  dayId: string;
  isFirst: boolean;
  isLast: boolean;
  onChange: (a: Activity) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id, data: { dayId } });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
    >
      <ActivityCard
        activity={activity}
        isFirst={isFirst}
        isLast={isLast}
        onChange={onChange}
        onDelete={onDelete}
        onMove={onMove}
        dragRef={setActivatorNodeRef}
        dragProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function DayColumn({
  day,
  children,
}: {
  day: Day;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.id });
  return (
    <section className="flex flex-col">
      <div className="sticky top-0 z-10 mb-3 rounded-2xl bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline">
          <h2 className="text-lg font-bold text-stone-800">
            {day.label}
            <span className="ml-2 text-sm font-normal text-stone-500">
              {day.weekday}
            </span>
          </h2>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-col gap-4 rounded-2xl transition-colors ${
          isOver ? "bg-rose-100/50" : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}

export default function Planner({
  days,
  onReorder,
  onActivityChange,
  onActivityDelete,
  onActivityAdd,
  onActivityMove,
}: Props) {
  const [localDays, setLocalDays] = useState<Day[]>(days);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 没在拖的时候，跟随外部（包括对方同步过来的）数据
  useEffect(() => {
    if (!activeId) setLocalDays(days);
  }, [days, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // 找出某个 id 属于哪个“天”（id 可能是活动 id，也可能是某天容器 id）
  function containerOf(id: string): string | null {
    if (localDays.some((d) => d.id === id)) return id;
    const d = localDays.find((x) => x.items.some((it) => it.id === id));
    return d ? d.id : null;
  }

  const activeActivity = activeId
    ? localDays.flatMap((d) => d.items).find((it) => it.id === activeId) ?? null
    : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    if (aId === oId) return;
    const aCont = containerOf(aId);
    const oCont = containerOf(oId);
    if (!aCont || !oCont || aCont === oCont) return;

    setLocalDays((prev) => {
      const next = prev.map((d) => ({ ...d, items: [...d.items] }));
      const aD = next.find((d) => d.id === aCont);
      const oD = next.find((d) => d.id === oCont);
      if (!aD || !oD) return prev;
      const aIdx = aD.items.findIndex((it) => it.id === aId);
      if (aIdx < 0) return prev;
      const [moved] = aD.items.splice(aIdx, 1);
      let oIdx = oD.items.findIndex((it) => it.id === oId);
      if (oId === oCont || oIdx < 0) oIdx = oD.items.length;
      oD.items.splice(oIdx, 0, moved);
      return next;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const aId = String(active.id);
    setActiveId(null);
    if (!over) {
      onReorder(localDays);
      return;
    }
    const oId = String(over.id);
    const aCont = containerOf(aId);
    const oCont = containerOf(oId);
    let final = localDays;
    if (aCont && oCont && aCont === oCont && aId !== oId) {
      final = localDays.map((d) => {
        if (d.id !== aCont) return d;
        const from = d.items.findIndex((it) => it.id === aId);
        let to = d.items.findIndex((it) => it.id === oId);
        if (oId === oCont) to = d.items.length - 1;
        if (from < 0 || to < 0) return d;
        return { ...d, items: arrayMove(d.items, from, to) };
      });
    }
    setLocalDays(final);
    onReorder(final);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-6">
        {localDays.map((day) => (
          <DayColumn key={day.id} day={day}>
            <SortableContext
              items={day.items.map((it) => it.id)}
              strategy={verticalListSortingStrategy}
            >
              {day.items.map((it, idx) => (
                <SortableActivity
                  key={it.id}
                  activity={it}
                  dayId={day.id}
                  isFirst={idx === 0}
                  isLast={idx === day.items.length - 1}
                  onChange={(a) => onActivityChange(day.id, a)}
                  onDelete={() => onActivityDelete(day.id, it.id)}
                  onMove={(dir) => onActivityMove(day.id, idx, dir)}
                />
              ))}
            </SortableContext>
            <button
              onClick={() => onActivityAdd(day.id)}
              className="rounded-2xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-400 transition hover:border-rose-300 hover:text-rose-500"
            >
              + 加一项
            </button>
          </DayColumn>
        ))}
      </div>

      <DragOverlay>
        {activeActivity ? (
          <div className="rotate-1 cursor-grabbing">
            <ActivityCard
              activity={activeActivity}
              isFirst
              isLast
              onChange={() => {}}
              onDelete={() => {}}
              onMove={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
