import '@mikan/ui/styles.css'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })
const geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mikan | an AI-powered minimalist daily todo app',
  description: 'AI-powered minimalist daily todo app'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.className} ${geistMono.className}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
