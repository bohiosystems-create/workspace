import { NextResponse } from "next/server";
import { getRepo } from "@/lib/store";
import { currentUser } from "@/lib/auth/session";
import { directory, digits, LIMITS, ROLE_LABEL, type Person, type Role } from "@/lib/auth/people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The people directory with roles and approval limits. Managers and up can see it (with numbers); admins change it.
// GET  -> { people, roles }
// POST { phone, name, role, domain?, facilityId?, title?, remove? } (admin)
const visible = (p: Person | null) => !!p && (p.role === "manager" || p.role === "director" || p.role === "admin");
export async function GET(req: Request) {
  const me = await currentUser(req);
  if (!visible(me)) return NextResponse.json({ error: "Managers and admins only." }, { status: 403 });
  const db = (await getRepo()).db;
  return NextResponse.json({ people: directory(db), canEdit: me!.role === "admin", roles: Object.entries(LIMITS).map(([id, l]) => ({ id, label: ROLE_LABEL[id as Role], limits: l.label })) });
}
export async function POST(req: Request) {
  const me = await currentUser(req);
  if (me?.role !== "admin") return NextResponse.json({ error: "Only an admin can change people and roles." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { phone?: string; name?: string; role?: Role; domain?: Person["domain"]; facilityId?: string; title?: string; remove?: boolean };
  const phone = digits(b.phone ?? "");
  if (phone.length < 8) return NextResponse.json({ error: "A full mobile number with country code, e.g. 966548363683." }, { status: 400 });
  if (!b.remove && !(b.role && b.role in LIMITS)) return NextResponse.json({ error: "Which role?" }, { status: 400 });
  if (phone === me.phone && b.role !== "admin") return NextResponse.json({ error: "You can't remove your own admin rights." }, { status: 400 });
  const repo = await getRepo();
  const list = (repo.db.people ??= []).filter((x) => digits(x.phone) !== phone);
  list.push({ phone, name: String(b.name ?? "").trim().slice(0, 60), role: b.role ?? "field", ...(b.domain ? { domain: b.domain } : {}), ...(b.facilityId ? { facilityId: b.facilityId } : {}), ...(b.title ? { title: b.title.slice(0, 60) } : {}), ...(b.remove ? { removed: true } : {}), by: me.name, at: new Date().toISOString() });
  repo.db.people = list;
  await repo.save();
  return NextResponse.json({ ok: true, people: directory(repo.db) });
}
