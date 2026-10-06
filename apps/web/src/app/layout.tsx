import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VITICO Wholesale", template: "%s · VITICO Wholesale" },
  description: "Wholesale ordering for VITICO customers across Fiji and the Pacific.",
};

export const viewport: Viewport = {
  themeColor: "#0f766a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
