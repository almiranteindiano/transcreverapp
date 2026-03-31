import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'WorshipApp - Gestão de Cifras e Letras',
  description: 'Sistema intuitivo para músicos e cantores de louvor. Gerencie cifras, transponha tons, crie setlists e compartilhe letras e acordes.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
