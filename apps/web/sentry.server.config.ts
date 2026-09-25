import * as Sentry from '@sentry/nextjs';
import { instrumentPostgresJsSql } from '@sentry/core';
import { setSqlWrapper } from '@floow/db';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 100% no servidor: é daqui que sai o tempo por rota e por consulta ao
  // banco, e com o tráfego atual 10% deixava rota sem amostra nenhuma. O
  // cliente e o edge (middleware) seguem em 10%, onde o custo estava.
  // Erros são 100% de qualquer jeito — sampling de trace não os afeta.
  tracesSampleRate: 1.0,
});

// Cada consulta ao banco vira um span no trace da rota. A integração
// automática (postgresJsIntegration) depende de hook de require e não alcança
// o `postgres` empacotado pelo Next; envolver a instância funciona em qualquer
// bundle. Cobre `unsafe` (o que o Drizzle usa) e `begin` (transações do RLS).
setSqlWrapper((sql) => instrumentPostgresJsSql(sql));
