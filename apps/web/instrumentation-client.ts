import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 100%: o Sentry é a fonte do tempo de carregamento no navegador (Web
  // Vitals por rota), no lugar do Vercel Speed Insights. Estava em 10% para
  // poupar CPU e rede a cada navegação; se voltar a pesar, baixar aqui.
  // Erros são 100% de qualquer jeito.
  tracesSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
