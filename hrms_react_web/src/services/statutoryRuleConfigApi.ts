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

// Rule-builder catalog: rule types + form fields. Structure comes from the
// backend (mirrors the rule engine schema); defaults/help/notifications are
// read from statutory_rule_configs so law changes never need a code change.
export interface RuleCatalogField {
  key: string;
  label: string;
  kind: 'number' | 'bool';
  unit?: string | null;
  default?: number | boolean | null;
  help?: string | null;
  standardValue?: string | null;
  notificationRef?: string | null;
  legalBasis?: string | null;
  effectiveDate?: string | null;
}

export interface RuleCatalogType {
  value: string;
  label: string;
  isJson: boolean;
  fields: RuleCatalogField[];
}

export const getRuleCatalog = (): Promise<{ ruleTypes: RuleCatalogType[] }> =>
  api.get('/statutory-rules/catalog').then(r => r.data);

export const upsertStatutoryRules = (rules: StatutoryRuleConfig[]) =>
  api.put('/statutory-rules', { rules }).then(r => r.data);

export const deleteStatutoryRule = (ruleKey: string) =>
  api.delete(`/statutory-rules/${ruleKey}`).then(r => r.data);
