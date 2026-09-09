import type { PortalProfile } from './types';

const KEY = 'jobspro_portal_profile';

export function loadLocalProfile(): PortalProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PortalProfile) : null;
  } catch {
    return null;
  }
}

export function saveLocalProfile(profile: PortalProfile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function savedJobsKey() {
  return 'jobspro_saved_jobs';
}

export function loadSavedJobs(): number[] {
  try {
    const raw = localStorage.getItem(savedJobsKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

const ALERT_EMAIL_KEY = 'jobspro_alert_email';

export function loadAlertEmail(): string {
  try {
    return localStorage.getItem(ALERT_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function saveAlertEmail(email: string) {
  try {
    localStorage.setItem(ALERT_EMAIL_KEY, email);
  } catch {
    // ignore
  }
}

export function toggleSavedJob(jobId: number): number[] {
  const current = loadSavedJobs();
  const next = current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId];
  localStorage.setItem(savedJobsKey(), JSON.stringify(next));
  return next;
}
