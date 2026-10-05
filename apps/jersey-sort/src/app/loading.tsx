export default function Loading() {
  return (
    <div
      className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-md bg-panel-2" />
      ))}
    </div>
  );
}
