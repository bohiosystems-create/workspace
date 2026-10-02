import type { Metadata } from "next";
import "./globals.css";
import Chat from "./_components/Chat";

export const metadata: Metadata = {
  title: "Bohio — AI Assistant Director of Marketing",
  description: "Monitor and orchestrate marketing vendors, campaigns and their impact on sales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Chat />
      </body>
    </html>
  );
}
