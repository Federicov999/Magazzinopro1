import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Magazzino Pro',
  description: 'Gestionale magazzino ristorante',
  manifest: '/manifest.json',
  themeColor: '#c8923a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Magazzino Pro',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#c8923a" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  )
}
