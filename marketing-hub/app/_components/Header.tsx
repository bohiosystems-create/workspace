"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./lang";

const LINKS = [
  { href: "/", label: "Vendors & Campaigns" },
  { href: "/invoices", label: "Supplier Invoices" },
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
        <div className="logo">B</div>
        <div>
          <b>{lang === "ar" ? "بوهيو" : "Bohio"}</b>
          <small>{t("Marketing Hub")}</small>
        </div>
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
