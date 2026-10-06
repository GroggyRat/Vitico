import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VITICO Wholesale", template: "%s · VITICO Wholesale" },
  description: "Wholesale ordering for VITICO customers across Fiji and the Pacific.",
  applicationName: "VITICO Wholesale",
  appleWebApp: { capable: true, title: "VITICO", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f766a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
