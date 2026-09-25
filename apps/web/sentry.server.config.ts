import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 100% no servidor: é daqui que sai o tempo por rota e por consulta ao
  // banco, e com o tráfego atual 10% deixava rota sem amostra nenhuma. O
  // cliente e o edge (middleware) seguem em 10%, onde o custo estava.
  // Erros são 100% de qualquer jeito — sampling de trace não os afeta.
  tracesSampleRate: 1.0,
});
