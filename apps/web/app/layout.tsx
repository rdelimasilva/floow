import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Floow',
  description: 'Your complete financial platform',
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
