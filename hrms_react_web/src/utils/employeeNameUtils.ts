export type NameLike = {
  fullName?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** Join stored first/last name parts for display in a single input. */
export function joinEmployeeName(first?: string | null, last?: string | null): string {
  return [first, last].filter((p) => p && String(p).trim()).join(' ').trim();
}

/** Split a full name: first token → firstName, remainder → lastName. */
export function splitEmployeeName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

/** Single display name for employees, candidates, and legacy API shapes. */
export function personDisplayName(person?: NameLike | null, fallback = ''): string {
  if (!person) return fallback;
  const direct = (person.fullName || person.name || '').trim();
  if (direct) return direct;
  const joined = joinEmployeeName(
    person.firstName ?? person.first_name,
    person.lastName ?? person.last_name,
  );
  return joined || fallback;
}

/** Up to two initials from a person's display name. */
export function personInitials(person?: NameLike | null, fallback = '?'): string {
  const name = personDisplayName(person, '');
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Build API payload with a single fullName field (backend source of truth). */
export function toFullNamePayload<T extends Record<string, unknown>>(data: T): T & { fullName: string } {
  const fullName = personDisplayName(data as NameLike);
  const rest: Record<string, unknown> = { ...data };
  delete rest.firstName;
  delete rest.lastName;
  return { ...rest, fullName } as T & { fullName: string };
}

/** Safe filename slug from a person's name. */
export function personFileSlug(person?: NameLike | null, fallback = 'employee'): string {
  const name = personDisplayName(person, fallback);
  return name.replace(/\s+/g, '_').replace(/[^\w.-]/g, '') || fallback;
}
