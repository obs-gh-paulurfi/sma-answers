import type { Metadata, Viewport } from "next";
import { parish } from "@/config/parish";
import "./globals.css";

export const metadata: Metadata = {
  title: parish.appName,
  description: `Questions about the Catholic faith and ${parish.shortName} parish life, answered with sources.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#800020" },
    { media: "(prefers-color-scheme: dark)", color: "#6e0a22" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
