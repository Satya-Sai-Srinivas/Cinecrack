export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3">
      <div className="skeleton aspect-[2/3] w-full rounded-xl" />
      <div className="skeleton h-4 w-3/4 rounded" />
      <div className="skeleton h-3 w-1/2 rounded" />
    </div>
  )
}

export function SkeletonGrid({ count = 12 }) {
  return (
    <div className="movie-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
