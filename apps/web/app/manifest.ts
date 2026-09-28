import type { MetadataRoute } from 'next'

// Instalável na tela inicial do celular. O start_url cai no dashboard; quem
// não está logado é mandado para /auth pelo middleware.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'floow - finanças pessoais',
    short_name: 'floow',
    description: 'Organize suas finanças pessoais com o floow',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
