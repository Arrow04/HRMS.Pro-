const isDev = __DEV__;

const logger = {
  error: (...args) => {
    if (isDev) console.error('[HRMS]', ...args);
  },
  warn: (...args) => {
    if (isDev) console.warn('[HRMS]', ...args);
  },
  info: (...args) => {
    if (isDev) console.log('[HRMS]', ...args);
  },
  debug: (...args) => {
    if (isDev) console.log('[HRMS:DEBUG]', ...args);
  },
};

export default logger;
