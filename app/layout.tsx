import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Self-hosted Geist (via the `geist` package) instead of next/font/google, so
// builds don't depend on fetching the font from Google Fonts at build time.
// Both expose the --font-geist-sans / --font-geist-mono CSS variables.

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://metadata-mutation-checker-chi.vercel.app";
const siteDescription =
  "Review PDF metadata consistency and possible tampering signals. Results are heuristic signals for human review, not proof of manipulation.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Document Metadata Mutation Checker",
    template: "%s · Metadata Mutation Checker",
  },
  description: siteDescription,
  keywords: [
    "PDF metadata",
    "document forensics",
    "metadata analysis",
    "document integrity",
    "Next.js",
  ],
  authors: [{ name: "Damika Anupama", url: "https://github.com/Damika-Anupama" }],
  creator: "Damika Anupama",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Metadata Mutation Checker",
    title: "Document Metadata Mutation Checker",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Document Metadata Mutation Checker",
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
