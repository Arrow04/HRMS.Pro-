import React, { useMemo, useRef, useEffect, useState } from 'react';

interface VirtualizedTableProps<T extends { id: number | string }> {
  data: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

/**
 * Virtualized Table Component for rendering large datasets efficiently
 * Only renders visible items plus a buffer (overscan) for smooth scrolling
 */
export function VirtualizedTable<T extends { id: number | string }>({
  data,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5
}: VirtualizedTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const { visibleRange, totalHeight, offsetY } = useMemo(() => {
    const totalHeight = data.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      data.length - 1,
      Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    return {
      visibleRange: { start: startIndex, end: endIndex },
      totalHeight,
      offsetY: startIndex * itemHeight
    };
  }, [scrollTop, itemHeight, containerHeight, overscan, data.length]);

  const visibleItems = useMemo(() => {
    return data.slice(visibleRange.start, visibleRange.end + 1);
  }, [data, visibleRange]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height: containerHeight, overflow: 'auto' }}
      className="relative"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div
              key={item.id || index}
              style={{ height: itemHeight }}
            >
              {renderItem(item, visibleRange.start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
