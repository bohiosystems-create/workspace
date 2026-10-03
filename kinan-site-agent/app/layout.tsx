import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kinan Site Agent",
  description: "Project documents, drawings, programme, procurement and a detailed site map, with an AI agent, on site.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Site Agent", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#1c1c1e" };

// Apply a saved Dark/Light choice before first paint (no flash).
const THEME = `try{var t=localStorage.getItem("kinan.theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
