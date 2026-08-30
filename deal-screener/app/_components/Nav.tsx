"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/reporting", label: "LP Reporting" },
  { href: "/debt", label: "Debt & Covenants" },
  { href: "/screening", label: "Deal Screening" },
  { href: "/crm", label: "CRM" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <div className="topnav">
      <Link href="/" className="brand" style={{ textDecoration: "none" }}>
        <div className="logo">B</div>
        <div>
          <b>Bohio</b>
          <small>Fund Operations</small>
        </div>
      </Link>
      <div className="navlinks">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`navlink${path === l.href ? " active" : ""}`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
