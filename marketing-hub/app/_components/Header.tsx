"use client";

const LINKS = [
  { href: "/", label: "Vendors & Campaigns" },
  { href: "/invoices", label: "Supplier Invoices" },
];

export default function Header() {
  // Plain anchors + location so this component has no framework dependency.
  const path = typeof window === "undefined" ? "/" : (window as any).__demoPath ?? window.location.pathname;
  return (
    <div className="topnav">
      <div className="brand">
        <div className="logo">B</div>
        <div>
          <b>Bohio</b>
          <small>Marketing Hub</small>
        </div>
      </div>
      <div className="navlinks">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={`navlink${path === l.href ? " active" : ""}`}>
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
