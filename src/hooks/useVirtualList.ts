import { useMemo } from 'react';

interface VirtualListRange {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
}

interface UseVirtualListOptions {
  itemCount: number;
  itemHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}

export function useVirtualList({
  itemCount,
  itemHeight,
  scrollTop,
  viewportHeight,
  overscan = 8,
}: UseVirtualListOptions): VirtualListRange {
  return useMemo(() => {
    if (itemCount <= 0 || viewportHeight <= 0) {
      return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(itemCount, startIndex + visibleCount);

    return {
      startIndex,
      endIndex,
      paddingTop: startIndex * itemHeight,
      paddingBottom: Math.max(0, (itemCount - endIndex) * itemHeight),
    };
  }, [itemCount, itemHeight, overscan, scrollTop, viewportHeight]);
}
