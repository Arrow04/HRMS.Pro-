export function normalizeArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  const record = data as Record<string, unknown> | undefined;
  if (record?.items) return record.items as T[];
  if (record?.data) return record.data as T[];
  if (record?.employees) return record.employees as T[];
  if (record?.results) return record.results as T[];
  if (record?.records) return record.records as T[];
  return [];
}
