import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'TranscreveAI - Transcrição de Vídeos e Áudios',
  description: 'Transcreva vídeos do YouTube, Instagram, Drive e uploads locais com tradução automática e exportação para Word, PDF e TXT.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
