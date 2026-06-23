import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/shared/components/app/navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Application Tracker",
  description: "Track every job application through its status pipeline with a full, immutable history of each change.",
};

// Match the browser UI chrome to the page background in light and dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020817" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden">
        <Providers>
          {/* First tab stop: lets keyboard users jump past the navbar straight to the content. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
          <Navbar />
          {/* tabIndex -1 so the skip link can move focus here; outline-none since it is a
              programmatic landmark target, not an interactive control. */}
          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-hidden px-6 py-8 outline-none"
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
