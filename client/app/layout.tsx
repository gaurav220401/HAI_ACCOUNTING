import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TimeTrackingProvider } from "@/contexts/time-tracking-context";
import { QueryProvider } from "@/contexts/query-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { OrganizationProvider } from "@/contexts/organization-context";
import { OrganizationChangeBoundary } from "@/components/organization-change-boundary";
import { ServerStatusGate } from "@/components/server-status-gate";
import { FloatingChatbot } from "@/components/floating-chatbot";
import { FloatingAgentLauncher } from "@/components/floating-agent-launcher";
import { VisualAgentOverlay } from "@/components/visual-agent-overlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HAI Accounting - Complete Business Management System",
    template: "%s | HAI Accounting"
  },
  description: "Professional accounting and business management software for small to medium businesses. Manage invoices, expenses, inventory, time tracking, and financial reports with ease.",
  keywords: ["accounting", "business management", "invoicing", "expense tracking", "inventory", "financial reports", "small business"],
  authors: [{ name: "HAI Accounting Team" }],
  creator: "HAI Accounting",
  publisher: "HAI Accounting",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("http://localhost:3000"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "HAI Accounting - Complete Business Management System",
    description: "Professional accounting and business management software for small to medium businesses.",
    siteName: "HAI Accounting",
    images: [
      {
        url: "/hailogo.png",
        width: 1200,
        height: 630,
        alt: "HAI Accounting Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HAI Accounting - Complete Business Management System",
    description: "Professional accounting and business management software for small to medium businesses.",
    images: ["/hailogo.png"],
    creator: "@haiaccounting",
  },
  icons: {
    icon: "/hailogo.png",
    shortcut: "/hailogo.png",
    apple: "/hailogo.png",
  },
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <QueryProvider>
          <AuthProvider>
            <ServerStatusGate>
              <OrganizationProvider>
                <OrganizationChangeBoundary>
                  <TimeTrackingProvider>
                    {children}
                    <VisualAgentOverlay />
                    <FloatingChatbot />
                    <FloatingAgentLauncher />
                  </TimeTrackingProvider>
                </OrganizationChangeBoundary>
              </OrganizationProvider>
            </ServerStatusGate>
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
