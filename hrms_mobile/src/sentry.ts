import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.SENTRY_DSN || 'https://examplePublicKey@o0.ingest.sentry.io/0';

Sentry.init({
  dsn: SENTRY_DSN,
  debug: __DEV__,
  tracesSampleRate: 0.2,
  profilesSampleRate: 0.1,
  environment: __DEV__ ? 'development' : 'production',
  release: `hrms-mobile@${__DEV__ ? 'dev' : 'prod'}`,
});

export function handleError(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  Sentry.captureMessage(message, level);
}

export function setUserContext(userId: string, userEmail: string) {
  Sentry.setUser({ id: userId, email: userEmail });
}

export default Sentry;
