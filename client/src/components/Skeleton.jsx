// Loading placeholders — shown while data fetches (replaces spinners).

export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="skeleton aspect-[16/10] w-full" />
      <div className="flex flex-col gap-2.5 p-4">
        <div className="skeleton h-6 w-28 rounded-md" />
        <div className="skeleton h-4 w-3/4 rounded-md" />
        <div className="skeleton h-3 w-1/2 rounded-md" />
        <div className="mt-2 flex gap-3 border-t border-slate-100 pt-3">
          <div className="skeleton h-3 w-14 rounded-md" />
          <div className="skeleton h-3 w-14 rounded-md" />
          <div className="skeleton h-3 w-14 rounded-md" />
        </div>
        <div className="mt-2 flex gap-2">
          <div className="skeleton h-9 flex-1 rounded-xl" />
          <div className="skeleton h-9 w-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function SkeletonProperty() {
  return (
    <div className="mx-auto mt-8 w-[min(1200px,94%)] pb-10">
      <div className="skeleton mb-4 h-4 w-28 rounded-md" />
      <div className="grid items-start gap-7 lg:grid-cols-[1.7fr_1fr]">
        <div>
          <div className="skeleton aspect-video w-full rounded-3xl" />
          <div className="mt-2.5 grid grid-cols-4 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton aspect-[4/3] rounded-xl" />)}
          </div>
          <div className="skeleton mt-6 h-40 w-full rounded-3xl" />
        </div>
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
          <div className="skeleton h-9 w-40 rounded-lg" />
          <div className="skeleton mt-3 h-6 w-3/4 rounded-md" />
          <div className="skeleton mt-2 h-4 w-1/2 rounded-md" />
          <div className="mt-6 space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-xl" />)}
          </div>
        </div>
      </div>
    </div>
  );
}
