import type { Metadata, Viewport } from "next";
import "./brand-fonts.css";
import "./globals.css";
import KinanSplash from "./_components/KinanSplash";

export const metadata: Metadata = {
  title: "Kinan Onsite Agent",
  description: "Project documents, drawings, programme, procurement and a detailed site map, with an AI agent, on site.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Onsite Agent", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#2e2e2f" };

// Apply the theme before first paint (no flash). Light by default, like the other Kinan agents; Dark or Auto
// (follow the device) only when chosen in the settings menu.
const THEME = `try{var t=localStorage.getItem("kinan.theme")||"light";if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body><KinanSplash />{children}</body>
    </html>
  );
}
