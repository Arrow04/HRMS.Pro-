import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 100));
    expect(result.current).toBe('hello');
  });

  it('updates the value after the delay elapses', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 100), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    expect(result.current).toBe('a');
    await act(() => vi.advanceTimersByTimeAsync(99));
    expect(result.current).toBe('a');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toBe('b');
    vi.useRealTimers();
  });

  it('resets the timer when the value changes quickly', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 100), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    await act(() => vi.advanceTimersByTimeAsync(90));
    rerender({ v: 'c' });
    await act(() => vi.advanceTimersByTimeAsync(90));
    expect(result.current).toBe('a');
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current).toBe('c');
    vi.useRealTimers();
  });

  it('uses a default delay of 500ms', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounce(v), { initialProps: { v: 'x' } });
    rerender({ v: 'y' });
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(result.current).toBe('x');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toBe('y');
    vi.useRealTimers();
  });
});
