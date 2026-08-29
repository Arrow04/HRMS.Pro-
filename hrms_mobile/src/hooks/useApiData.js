import { useState, useEffect, useCallback } from 'react';

export function useApiData(fetchFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchFn();
      setData(result);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, deps);

  useEffect(() => { fetchData(); }, [fetchData]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  return { data, loading, refreshing, error, refresh, setData };
}

export function normalizeResponse(res) {
  const d = res?.data;
  if (!d) return [];
  if (d.data) return d.data;
  if (d.items) return d.items;
  if (Array.isArray(d)) return d;
  return d;
}
