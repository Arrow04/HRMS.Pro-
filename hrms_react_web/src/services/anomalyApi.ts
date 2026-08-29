import api from './api';

export interface AnomalyAlert {
  id: number;
  anomaly_type: string;
  severity: string;
  title: string;
  description?: string;
  employee_ids?: number[];
  related_entity_type?: string;
  related_entity_id?: number;
  evidence_data?: Record<string, unknown>;
  status: string;
  created_at: string;
  dismissed_at?: string;
  dismissed_reason?: string;
}

export interface AnomalyStats {
  total_alerts: number;
  open_alerts: number;
  by_type: Record<string, number>;
}

export const getAnomalies = (params?: { status?: string; severity?: string; anomaly_type?: string; limit?: number }) =>
  api.get<AnomalyAlert[]>('/anomalies', { params }).then(r => r.data);

export const getAnomalyStats = () =>
  api.get<AnomalyStats>('/anomalies/stats').then(r => r.data);

export const runScan = () =>
  api.post<{ scanned_at: string; detected: number; new_alerts: number; by_type: Record<string, number> }>('/anomalies/scan').then(r => r.data);

export const dismissAnomaly = (id: number, reason?: string) =>
  api.put<AnomalyAlert>(`/anomalies/${id}/dismiss`, { reason }).then(r => r.data);

export const resolveAnomaly = (id: number) =>
  api.put<AnomalyAlert>(`/anomalies/${id}/resolve`).then(r => r.data);
