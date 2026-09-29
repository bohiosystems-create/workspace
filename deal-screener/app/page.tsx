import Link from "next/link";
import Nav from "./_components/Nav";

const WORKFLOWS = [
  {
    href: "/reporting",
    n: "01",
    title: "LP & Board Reporting",
    desc: "Ask for a report; Claude interprets, the snapshot & returns compute from the fund's asset data and live debt, and Claude drafts the commentary.",
  },
  {
    href: "/debt",
    n: "02",
    title: "Debt & Covenants",
    desc: "ICR / LTV / DSCR, maturity ladder and covenant headroom computed across the facilities register, with forward-looking alerts and an AI risk narrative.",
  },
  {
    href: "/screening",
    n: "03",
    title: "Deal Screening",
    desc: "Upload a teaser or OM; Claude extracts the figures, a deterministic underwrite runs against the fund hurdles, and Claude drafts the IC memo.",
  },
  {
    href: "/marketing",
    n: "04",
    title: "Marketing & Sales",
    desc: "Monitor and orchestrate marketing vendors: campaign spend, funnel and contracted sales per vendor, SLA and contract alerts, and one-click pause / budget-shift decisions with an audit trail.",
  },
];

export default function Home() {
  return (
    <div className="shell">
      <Nav />
      <div className="section-title">Fund Operations OS</div>
      <p className="intro">
        Four workflows wired into one fund dataset. Reporting, Debt and Marketing read a
        seeded register of funds, assets, facilities, distributions and marketing vendors; Deal
        Screening reads uploaded teasers. Claude does the language work;
        deterministic code does the maths.
      </p>

      <div className="cards">
        {WORKFLOWS.map((w) => (
          <Link key={w.href} href={w.href} className="card">
            <div className="card-n">{w.n}</div>
            <div className="card-t">{w.title}</div>
            <div className="card-d">{w.desc}</div>
            <div className="card-go">Open →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
