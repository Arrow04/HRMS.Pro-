let _timezone = 'Asia/Kolkata';

export const setTimezone = (tz) => { _timezone = tz; };
export const getTimezone = () => _timezone;

export const fmtTime = (dateInput) => {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: _timezone });
};

export const fmtTimeSec = (dateInput) => {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: _timezone });
};

export const fmtDate = (dateInput) => {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: _timezone });
};

export const fmtDateShort = (dateInput) => {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: _timezone });
};

export const fmtDateCompact = (dateInput) => {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: _timezone });
};

export const fmtWeekday = (dateInput) => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: _timezone });
};

export const fmtMonthYear = (dateInput) => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: _timezone });
};

export const fmtMonth = (dateInput) => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: _timezone });
};

export const fmtLongDate = (dateInput) => {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: _timezone });
};

export const fmtDateSlash = (dateInput) => {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: _timezone });
};

export const nowZone = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: _timezone });
};

export const todayZone = () => {
  const now = new Date();
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: _timezone });
};

export const todayISO = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: _timezone }).formatToParts(new Date());
  const map = {};
  parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
};

export const daysAgoISO = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: _timezone }).formatToParts(d);
  const map = {};
  parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
};

export const monthStartISO = (year, month) => {
  const d = new Date(year, month - 1, 1);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: _timezone }).formatToParts(d);
  const map = {};
  parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
};

export const monthEndISO = (year, month) => {
  const d = new Date(year, month, 0);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: _timezone }).formatToParts(d);
  const map = {};
  parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
};
