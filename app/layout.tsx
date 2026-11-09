import type { Metadata, Viewport } from "next";
import { Heebo, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DISTRO - ניהול ופרסום קבוצות",
  description: "ניהול קמפיינים ופרסום אוטומטי לקבוצות פייסבוק",
  applicationName: "DISTRO",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DISTRO",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png", // iOS Bookmark Icon
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="DISTRO" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body
        className={`${heebo.variable} ${inter.variable} ${geistMono.variable} min-h-screen bg-[#F8FAFC] font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
