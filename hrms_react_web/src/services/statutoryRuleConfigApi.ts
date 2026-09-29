import api from './api';

export interface StatutoryRuleConfig {
  id?: number;
  category: string;
  rule_key: string;
  label: string;
  standard_value?: string;
  current_value?: number;
  unit?: string;
  notification_ref?: string;
  legal_basis?: string;
  effective_date?: string;
  description?: string;
  status?: string;
}

export const getStatutoryRules = (category?: string) =>
  api.get('/statutory-rules', { params: category ? { category } : {} }).then(r => r.data);

export const getStatutoryCategories = () =>
  api.get('/statutory-rules/categories').then(r => r.data);

export const upsertStatutoryRules = (rules: StatutoryRuleConfig[]) =>
  api.put('/statutory-rules', { rules }).then(r => r.data);

export const deleteStatutoryRule = (ruleKey: string) =>
  api.delete(`/statutory-rules/${ruleKey}`).then(r => r.data);
