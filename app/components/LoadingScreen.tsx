import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export default function LoadingScreen({
  message = "正在打开你们的行程…",
}: {
  message?: string;
}) {
  return (
    <main className="min-h-full bg-gradient-to-b from-rose-50 via-amber-50 to-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <header className="flex flex-col items-center text-center">
          <span className="rounded-full bg-rose-500 px-3 py-1 text-sm font-medium text-white">
            我们的旅行计划
          </span>
          <Skeleton className="mt-4 h-9 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-56 max-w-full" />
          <div className="mt-5 flex items-center gap-2 text-sm text-stone-500">
            <span className="size-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
            {message}
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((col) => (
            <section key={col} className="flex flex-col">
              <div className="mb-3 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 + col }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
