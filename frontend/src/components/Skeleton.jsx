// Theme-aware shimmer placeholders. Light grey on light mode, dark grey on dark.
export function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800 ${className}`} />
  );
}

// Generic page skeleton used as the lazy-route loading fallback — a calm,
// branded placeholder instead of a "Loading…" string while a page loads.
export default function SkeletonPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-6">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-44 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
