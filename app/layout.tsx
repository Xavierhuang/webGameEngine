import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kids Game Builder - Create Amazing Games!',
  description: 'A fun and safe platform for kids to create their own games with AI assistance',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

