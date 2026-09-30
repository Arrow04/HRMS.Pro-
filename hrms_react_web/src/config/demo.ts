/**
 * DEMO MODE — frictionless walkthroughs.
 * When true, all confirmation dialogs (delete / bulk / action) auto-confirm
 * the moment they open, window.confirm gates are skipped, and form
 * validation never blocks a save. The server remains the source of truth
 * and still validates everything.
 *
 * To restore every guard: set this to false. Nothing else changes.
 * In production, this MUST be false — controlled by VITE_DEMO_MODE env var.
 */
export const DEMO_NO_GUARDS = import.meta.env.VITE_DEMO_MODE === 'true';
