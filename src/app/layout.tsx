import './globals.css'
import type { Metadata } from 'next'
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  title: 'Template Manager',
  description: 'Manage your markdown templates',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&family=Heebo:wght@400;500;700&family=Assistant:wght@400;600;700&family=Varela+Round&family=Secular+One&family=Suez+One&family=Frank+Ruhl+Libre:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
