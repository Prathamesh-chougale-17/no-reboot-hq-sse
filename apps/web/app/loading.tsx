export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
          />
        ))}
      </div>
    </div>
  );
}
