import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bohio — Marketing Hub",
  description: "Monitor and orchestrate marketing vendors, campaigns and their impact on sales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
