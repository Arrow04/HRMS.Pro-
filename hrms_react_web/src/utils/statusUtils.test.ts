import { describe, expect, it } from 'vitest';
import { getStatusBadgeClass, getStatusBadgeStyle } from './statusUtils';

describe('getStatusBadgeClass', () => {
  it('maps known statuses to their tailwind classes', () => {
    expect(getStatusBadgeClass('active')).toContain('--success-green');
    expect(getStatusBadgeClass('pending')).toContain('--warning-amber');
    expect(getStatusBadgeClass('rejected')).toContain('--danger-red');
    expect(getStatusBadgeClass('onboarding')).toContain('--accent-purple');
  });

  it('is case-insensitive', () => {
    expect(getStatusBadgeClass('PENDING')).toBe(getStatusBadgeClass('pending'));
    expect(getStatusBadgeClass('Active')).toBe(getStatusBadgeClass('active'));
  });

  it('returns the fallback class for unknown statuses', () => {
    expect(getStatusBadgeClass('unknown-status')).toContain('--text-tertiary');
    expect(getStatusBadgeClass('unknown-status')).toBe(getStatusBadgeClass('draft'));
  });

  it('returns the fallback for empty string', () => {
    expect(getStatusBadgeClass('')).toContain('--text-tertiary');
  });
});

describe('getStatusBadgeStyle', () => {
  it('returns inline styles for known statuses', () => {
    const style = getStatusBadgeStyle('active');
    expect(style).toMatchObject({
      bg: expect.any(String),
      text: 'var(--success-green)',
      border: expect.any(String),
    });
  });

  it('is case-insensitive', () => {
    expect(getStatusBadgeStyle('COMPLETED')).toEqual(getStatusBadgeStyle('completed'));
  });

  it('returns the fallback for unknown statuses', () => {
    expect(getStatusBadgeStyle('bogus')).toEqual(getStatusBadgeStyle('draft'));
  });
});
