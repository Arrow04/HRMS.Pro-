import api from './api';

export async function runAutomation(task: string, context: Record<string, unknown> = {}) {
  const res = await api.post('/api/ai/automation', { task, context });
  return res.data;
}
