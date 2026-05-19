import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CalendarSync Enterprise — Admin Dashboard',
  description: 'Enterprise Calendar Synchronization Platform — Admin Console',
  robots: { index: false, follow: false }, // NEVER index this private app
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex, nofollow, nosnippet, noarchive" />
        <meta name="googlebot" content="noindex, nofollow" />
      </head>
      <body>{children}</body>
    </html>
  );
}
