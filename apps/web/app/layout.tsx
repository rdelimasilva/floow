import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'floow - finanças pessoais em floow',
  description: 'Organize suas finanças pessoais com o floow',
  icons: {
    icon: 'https://ak8t3l6j6j.ufs.sh/f/CwfRtcqQB4vVBQBMqgGTkLbIyjwphG5CfF2KE4ru9eNaDWMP',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <title>floow - finanças pessoais em floow</title>
        <link rel="icon" href="https://ak8t3l6j6j.ufs.sh/f/CwfRtcqQB4vVBQBMqgGTkLbIyjwphG5CfF2KE4ru9eNaDWMP" />
      </head>
      <body>{children}</body>
    </html>
  );
}
