import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePagination } from './usePagination';

const DATA = Array.from({ length: 25 }, (_, i) => i + 1);

describe('usePagination', () => {
  it('computes total pages and initial page correctly', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 25, itemsPerPage: 10 }));
    expect(result.current.totalPages).toBe(3);
    expect(result.current.currentPage).toBe(1);
    expect(result.current.itemsPerPage).toBe(10);
  });

  it('computes start and end index for page 1', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 25, itemsPerPage: 10 }));
    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(10);
    expect(result.current.paginatedData(DATA)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('goes to the next page', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 25, itemsPerPage: 10 }));
    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(2);
    expect(result.current.startIndex).toBe(10);
    expect(result.current.endIndex).toBe(20);
  });

  it('does not advance past the last page', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 25, itemsPerPage: 10, initialPage: 3 }));
    act(() => result.current.nextPage());
    expect(result.current.currentPage).toBe(3);
    expect(result.current.canGoNext).toBe(false);
  });

  it('goes to the previous page and stops at the first page', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 25, itemsPerPage: 10, initialPage: 2 }));
    act(() => result.current.prevPage());
    expect(result.current.currentPage).toBe(1);
    act(() => result.current.prevPage());
    expect(result.current.currentPage).toBe(1);
    expect(result.current.canGoPrev).toBe(false);
  });

  it('goToPage clamps to valid bounds', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 25, itemsPerPage: 10 }));
    act(() => result.current.goToPage(2));
    expect(result.current.currentPage).toBe(2);
    act(() => result.current.goToPage(99));
    expect(result.current.currentPage).toBe(2);
    act(() => result.current.goToPage(0));
    expect(result.current.currentPage).toBe(2);
  });

  it('resets to page 1 when items per page changes', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 25, itemsPerPage: 10, initialPage: 3 }));
    act(() => result.current.setItemsPerPage(25));
    expect(result.current.itemsPerPage).toBe(25);
    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });

  it('handles zero items', () => {
    const { result } = renderHook(() => usePagination({ totalItems: 0 }));
    expect(result.current.totalPages).toBe(0);
    expect(result.current.paginatedData([])).toEqual([]);
    expect(result.current.canGoNext).toBe(false);
    expect(result.current.canGoPrev).toBe(false);
  });
});
