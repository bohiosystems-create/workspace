"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./lang";
import { KINAN, kinanLogoHtml, chevron } from "../../lib/brand";

const LINKS = [
  { href: "/", label: "Director" },
  { href: "/daily", label: "Daily check" },
  { href: "/ideas", label: "Initiatives" },
  { href: "/orchestration", label: "Vendors" },
  { href: "/reports", label: "Reports" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/decisions", label: "Decisions" },
  { href: "/experiments", label: "Experiments" },
];

export default function Header() {
  const { lang, t, setLang } = useI18n();
  // Plain anchors + location so this component has no framework dependency.
  // Read after mount so server and client render the same markup (no hydration mismatch).
  const [path, setPath] = useState("/");
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
    </div>
  );
}
