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

export const metadata: Metadata = {
  title: "Shroud — Compliant Privacy Pool with ASP Gateway",
  description:
    "A privacy pool on Stellar where users prove membership in an Association Set Provider (ASP) allowlist before depositing or withdrawing, keeping amounts private while blocking sanctioned addresses.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Shroud — Compliant Privacy Pool with ASP Gateway",
    description:
      "A privacy pool on Stellar where users prove membership in an Association Set Provider (ASP) allowlist before depositing or withdrawing, keeping amounts private while blocking sanctioned addresses.",
    url: "https://shroud.edycu.dev",
    siteName: "Shroud",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Shroud — Compliant Privacy Pool",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Shroud — Compliant Privacy Pool with ASP Gateway",
    description:
      "A privacy pool on Stellar where users prove membership in an Association Set Provider (ASP) allowlist before depositing or withdrawing, keeping amounts private while blocking sanctioned addresses.",
    images: ["/og-image.png"],
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
