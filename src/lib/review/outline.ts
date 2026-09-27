import type { ReviewDraft } from "./draft";

export type OutlineNode = { people: string[]; children: OutlineNode[] };

/**
 * A simple family outline for the review preview: each line is a person with
 * their spouse(s); their children are nested underneath. Starts from people
 * without parents; anyone not reached is listed separately.
 */
export function buildOutline(d: Pick<ReviewDraft, "people" | "relationships">) {
  const ids = new Set(d.people.map((p) => p.id));
  const spouses = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  const add = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const r of d.relationships) {
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    if (r.type === "SPOUSE") {
      add(spouses, r.from, r.to);
      add(spouses, r.to, r.from);
    } else {
      add(children, r.from, r.to);
      hasParent.add(r.to);
    }
  }

  const placed = new Set<string>();
  const visit = (id: string): OutlineNode | null => {
    if (placed.has(id)) return null;
    const couple = [id, ...(spouses.get(id) ?? []).filter((s) => !placed.has(s))];
    couple.forEach((p) => placed.add(p));
    const kids = [...new Set(couple.flatMap((p) => children.get(p) ?? []))];
    return { people: couple, children: kids.map(visit).filter((n): n is OutlineNode => n !== null) };
  };

  // Roots: nobody's child, and not married to someone who is (they appear with their spouse).
  const roots: OutlineNode[] = [];
  for (const p of d.people) {
    const married = spouses.get(p.id) ?? [];
    if (hasParent.has(p.id) || married.some((s) => hasParent.has(s))) continue;
    const node = visit(p.id);
    if (node) roots.push(node);
  }
  // Anyone left over (only reachable through a cycle, or married into a branch that wasn't reached).
  for (const p of d.people) {
    if (hasParent.has(p.id) && !placed.has(p.id)) {
      const node = visit(p.id);
      if (node) roots.push(node);
    }
  }
  const alone = roots.filter((n) => n.people.length === 1 && n.children.length === 0).map((n) => n.people[0]);
  return { roots: roots.filter((n) => n.people.length > 1 || n.children.length > 0), alone };
}
