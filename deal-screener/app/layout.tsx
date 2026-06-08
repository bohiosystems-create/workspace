import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bohio — Deal Screening",
  description: "Extract, underwrite, and draft IC memos from a teaser or OM.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
