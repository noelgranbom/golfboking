import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Golfbooking – Automatisk golfbevakare',
  description: 'Automatisk bevakare av lediga golftider på MinGolf',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
