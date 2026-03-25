/**
 * Root layout — wraps the entire app with the DM Sans font, tRPC provider, and global toast
 * notifications. Also defines site-wide OpenGraph and Twitter metadata for Vercel deployments.
 */
/**
 * Root layout for the entire application.
 * Wraps every page with the DM Sans font, the tRPC React provider, and the global
 * toast notification layer. Also defines site-wide metadata and Open Graph tags.
 */
import "@/styles/globals.css";
import { type Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { TRPCReactProvider } from "@/trpc/react";
import { ToastProvider } from "@/components/ToastProvider";

const dmSans = DM_Sans({ subsets: ["latin"] });

const siteUrl =
  process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://aiit-automation-hub.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AIIT Automation Hub",
  description: "All In IT Solutions — Automation Control Panel",
  icons: "/favicon.png",
  openGraph: {
    title: "AIIT Automation Hub",
    description: "All In IT Solutions — Automation Control Panel",
    url: siteUrl,
    siteName: "AIIT Automation Hub",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AIIT Automation Hub - All In IT Solutions",
      },
    ],
    locale: "en_AU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AIIT Automation Hub",
    description: "All In IT Solutions — Automation Control Panel",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.className} antialiased`}>
        <TRPCReactProvider>
          {children}
          <ToastProvider />
        </TRPCReactProvider>
      </body>
    </html>
  );
}
