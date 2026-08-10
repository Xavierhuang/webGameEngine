import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'lingplay — Make 3D games with blocks and AI',
  description: 'A creative coding platform for 3D games. Snap blocks together, ask an AI for help, and share your world.',
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

