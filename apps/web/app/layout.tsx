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

// apps/web/app/layout.tsx
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// import { httpBatchLink } from '@trpc/client'
// import { ReactNode } from 'react'
// import SuperJSON from 'superjson'
// import { trpc } from '../lib/trpc'

// export default function RootLayout({ children }: { children: ReactNode }) {
//   const queryClient = new QueryClient()
//   const trpcClient = trpc.createClient({
//     transformer: SuperJSON,
//     links: [
//       httpBatchLink({
//         url: '/api/trpc'
//       })
//     ]
//   })

//   return (
//     <html lang="en">
//       <body>
//         <trpc.Provider client={trpcClient} queryClient={queryClient}>
//           <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
//         </trpc.Provider>
//       </body>
//     </html>
//   )
// }
