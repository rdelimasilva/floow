import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'floow - finanças pessoais em floow',
  description: 'Organize suas finanças pessoais com o floow',
  icons: {
    icon: 'https://ak8t3l6j6j.ufs.sh/f/CwfRtcqQB4vVBQBMqgGTkLbIyjwphG5CfF2KE4ru9eNaDWMP',
  },
  appleWebApp: {
    capable: true,
    title: 'floow',
    statusBarStyle: 'default',
  },
  other: {
    'facebook-domain-verification': 'fak300dwrq09y9wij6ncmcn8y0ziv2',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
