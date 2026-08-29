const PageSkeleton = () => {
  return (
    <div className="space-y-6 animate-page-enter">
      <div className="rounded-2xl bg-gray-100 p-6 border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="w-48 h-7 rounded-full skeleton-shimmer" />
            <div className="w-36 h-4 rounded-full skeleton-shimmer" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-10 rounded-xl skeleton-shimmer" />
            <div className="w-24 h-10 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-4 border border-gray-200 bg-white shadow-sm min-h-[120px]">
            <div className="flex items-start justify-between gap-2">
              <div className="w-11 h-11 rounded-xl skeleton-shimmer shrink-0" />
              <div className="w-14 h-5 rounded-full skeleton-shimmer" />
            </div>
            <div className="mt-3">
              <div className="w-20 h-3 rounded-full skeleton-shimmer mb-2" />
              <div className="w-16 h-7 rounded-lg skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
          <div className="flex-1 min-w-[200px] h-10 rounded-lg skeleton-shimmer" />
          <div className="w-40 h-10 rounded-lg skeleton-shimmer" />
          <div className="w-40 h-10 rounded-lg skeleton-shimmer" />
        </div>
        <div>
          <div className="bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-4 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 rounded-full skeleton-shimmer" style={{ width: i === 0 ? 120 : 80 }} />
              ))}
            </div>
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-gray-100">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="h-3.5 rounded-full skeleton-shimmer" style={{ width: j === 0 ? 100 : 70 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PageSkeleton;
