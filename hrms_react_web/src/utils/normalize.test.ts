import { describe, expect, it } from 'vitest';
import { normalizeArray } from './normalize';

describe('normalizeArray', () => {
  it('returns the array as-is when passed an array', () => {
    const data = [{ id: 1 }, { id: 2 }];
    expect(normalizeArray(data)).toEqual(data);
  });

  it('extracts items from a wrapped { items } object', () => {
    expect(normalizeArray({ items: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('extracts items from a wrapped { data } object', () => {
    expect(normalizeArray({ data: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('extracts items from a wrapped { employees } object', () => {
    expect(normalizeArray({ employees: [{ name: 'A' }] })).toEqual([{ name: 'A' }]);
  });

  it('extracts items from a wrapped { results } object', () => {
    expect(normalizeArray({ results: [true] })).toEqual([true]);
  });

  it('extracts items from a wrapped { records } object', () => {
    expect(normalizeArray({ records: [7] })).toEqual([7]);
  });

  it('returns an empty array for null', () => {
    expect(normalizeArray(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(normalizeArray(undefined)).toEqual([]);
  });

  it('returns an empty array for a plain non-array object without keys', () => {
    expect(normalizeArray({ foo: 'bar' })).toEqual([]);
  });

  it('respects the type parameter for typed access', () => {
    const out = normalizeArray<{ id: number }>({ data: [{ id: 1 }] });
    expect(out[0].id).toBe(1);
  });
});
