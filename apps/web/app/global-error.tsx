'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Substitui o layout raiz inteiro, então o CSS global pode não estar carregado:
 * o estilo vai inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#dc2626', margin: 0 }}>Algo deu errado</h1>
          <p style={{ fontSize: 14, color: '#4b5563', maxWidth: 420, margin: 0 }}>
            O floow encontrou um problema inesperado. Tente de novo; se continuar, recarregue a página.
          </p>
          <button
            onClick={reset}
            style={{ padding: '8px 16px', fontSize: 14, background: '#111827', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}
          >
            Tentar novamente
          </button>
          {error.digest && <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Código do erro: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
