import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 10%: rastrear toda navegação custava CPU e rede em todas elas. Erros
  // continuam 100% — sampling de trace não afeta captura de exceção.
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
