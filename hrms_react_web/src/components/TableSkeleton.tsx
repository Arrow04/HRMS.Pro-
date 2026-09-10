interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

const TableSkeleton = ({ rows = 6, cols = 5 }: TableSkeletonProps) => (
  <div className="p-4 space-y-3" aria-hidden>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={c}
            className="skeleton-shimmer h-4 rounded-full"
            style={{ width: `${[38, 22, 16, 24, 12][c % 5]}%` }}
          />
        ))}
      </div>
    ))}
  </div>
);

export default TableSkeleton;
