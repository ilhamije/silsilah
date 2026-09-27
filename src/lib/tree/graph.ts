/*
 * Pure checks on a set of relationships, shared by the review screen (to warn
 * as the user edits) and the import endpoint (to refuse bad data).
 */

export type Edge = { type: "PARENT_CHILD" | "SPOUSE"; from: string; to: string };

export type GraphIssue =
  | { code: "self_link"; people: [string] }
  | { code: "cycle"; people: string[] } // someone would be their own ancestor
  | { code: "too_many_parents"; people: [string] };

export const MAX_PARENTS = 2;

export function checkGraph(edges: Edge[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.from === e.to) {
      issues.push({ code: "self_link", people: [e.from] });
      continue;
    }
    if (e.type !== "PARENT_CHILD") continue;
    if (!parents.has(e.to)) parents.set(e.to, new Set());
    parents.get(e.to)!.add(e.from);
    if (!children.has(e.from)) children.set(e.from, new Set());
    children.get(e.from)!.add(e.to);
  }
  for (const [child, ps] of parents) {
    if (ps.size > MAX_PARENTS) issues.push({ code: "too_many_parents", people: [child] });
  }

  // Iterative DFS with colours; reports each cycle once.
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  for (const start of children.keys()) {
    if (state.has(start)) continue;
    const stack: { node: string; iter: Iterator<string> }[] = [
      { node: start, iter: (children.get(start) ?? new Set()).values() },
    ];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = top.iter.next();
      if (next.done) {
        state.set(top.node, 2);
        stack.pop();
        continue;
      }
      const child = next.value;
      const s = state.get(child);
      if (s === 1) {
        const from = stack.findIndex((f) => f.node === child);
        issues.push({ code: "cycle", people: stack.slice(from).map((f) => f.node) });
      } else if (!s) {
        state.set(child, 1);
        stack.push({ node: child, iter: (children.get(child) ?? new Set()).values() });
      }
    }
  }
  return issues;
}
