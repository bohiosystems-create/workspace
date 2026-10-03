"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./lang";
import { KINAN_LOGO } from "../../lib/brand-logo";

const LINKS = [
  { href: "/", label: "Director" },
  { href: "/daily", label: "Daily check" },
  { href: "/ideas", label: "Initiatives" },
  { href: "/orchestration", label: "Orchestration" },
  { href: "/reports", label: "Reports" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/history", label: "History" },
  { href: "/decisions", label: "Decisions" },
  { href: "/experiments", label: "Experiments" },
  { href: "/invoices", label: "Invoices" },
];

export default function Header() {
  const { lang, t, setLang } = useI18n();
  // Plain anchors + location so this component has no framework dependency.
  // Read after mount so server and client render the same markup (no hydration mismatch).
  const [path, setPath] = useState("/");
  useEffect(() => { setPath((window as any).__demoPath ?? window.location.pathname); }, []);
  return (
    <div className="topnav">
      <div className="brand">
        {/* The Kinan logo on a dark band (brand/kinan-logo.*, embedded by scripts/brand-logo.mjs); wordmark until it is added. */}
        <a href="/" className="brand-band" aria-label="Kinan">
          {KINAN_LOGO ? <img src={KINAN_LOGO} alt="Kinan" /> : <span className="brand-word">{lang === "ar" ? "كنان" : "KINAN"}</span>}
        </a>
        <small>{t("AI Assistant Director of Marketing")}</small>
      </div>
      <div className="navlinks">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={`navlink${path === l.href ? " active" : ""}`}>
            {t(l.label)}
          </a>
        ))}
        <button className="navlink lang-toggle" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label="Language">
          {lang === "ar" ? "English" : "العربية"}
        </button>
      </div>
    </div>
  );
}
