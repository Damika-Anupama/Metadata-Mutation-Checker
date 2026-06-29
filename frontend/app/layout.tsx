import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://metadata-mutation-checker.vercel.app";
const siteDescription =
  "Upload a PDF to detect metadata tampering signals — risk scoring, ranked findings, and side-by-side document comparison.";

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
    "tampering detection",
    "document integrity",
    "Next.js",
    "FastAPI",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
