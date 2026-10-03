"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./lang";
import { KINAN, kinanLogoHtml, chevron } from "../../lib/brand";
import Integrations from "./Integrations";

const LINKS = [
  { href: "/", label: "Director" },
  { href: "/daily", label: "Daily check" },
  { href: "/ideas", label: "Initiatives" },
  { href: "/orchestration", label: "Vendors" },
  { href: "/reports", label: "Reports" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/experiments", label: "Experiments" },
];

export default function Header() {
  const { lang, t, setLang } = useI18n();
  // Plain anchors + location so this component has no framework dependency.
  // Read after mount so server and client render the same markup (no hydration mismatch).
  const [path, setPath] = useState("/");
  const [settings, setSettings] = useState(false);
  useEffect(() => { setPath((window as any).__demoPath ?? window.location.pathname); }, []);
  // The faceted page texture from Kinan's collateral, behind every page.
  useEffect(() => { if (KINAN.texture) document.body.style.setProperty("--kinan-texture", `url("${KINAN.texture}")`); }, []);
  return (
    <div className="topnav">
      {/* Kinan's website header: a full-width charcoal band, white logo, product line, orange chevron. */}
      <div className="k-band">
        <div className="k-band-in">
          <a href="/" className="k-band-logo" aria-label="Kinan" dangerouslySetInnerHTML={{ __html: kinanLogoHtml(34) }} />
          <span className="k-band-sub">{t("AI Assistant Director of Marketing")}</span>
          <button className="k-gear" onClick={() => setSettings(true)} aria-label={t("Settings and integrations")} title={t("Settings and integrations")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
          <button className="lang-toggle" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label="Language">{lang === "ar" ? "English" : "العربية"}</button>
          <span className="k-band-chev" dangerouslySetInnerHTML={{ __html: chevron(lang === "ar" ? "rtl" : "ltr", 30) }} />
        </div>
      </div>
      <nav className="k-nav">
        <div className="k-nav-in navlinks">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={`navlink${path === l.href ? " active" : ""}`}>{t(l.label)}</a>
          ))}
        </div>
      </nav>
      {settings && <Integrations onClose={() => setSettings(false)} />}
    </div>
  );
}
