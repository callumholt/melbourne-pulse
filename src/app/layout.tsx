import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://melbourne-pulse.vercel.app"),
  title: "Melbourne Pulse",
  description: "Real-time city activity dashboard for Melbourne",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}
