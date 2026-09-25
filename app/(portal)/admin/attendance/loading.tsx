export default function AttendanceLoading() {
  return (
    <div role="status" aria-label="Loading attendance" className="animate-pulse space-y-6">
      <div className="h-16 rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => <div key={index} className="h-20 rounded-xl bg-muted" />)}
      </div>
      <div className="h-96 rounded-2xl bg-muted" />
      <span className="sr-only">Loading attendance...</span>
    </div>
  );
}
