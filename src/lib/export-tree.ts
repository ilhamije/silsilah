import type { Db } from "@/lib/db";
import { readTree } from "@/lib/tree/read";
import { buildGedcom } from "@/lib/gedcom/export";

export type ExportFormat = "gedcom" | "json";

/**
 * A tree as a downloadable file. Goes through readTree, so a Viewer's export
 * has living people's details removed exactly as the chart does.
 */
export async function exportTree(db: Db, userId: string, treeId: string, format: ExportFormat, now = new Date()) {
  const data = await readTree(db, userId, treeId);
  const slug = data.tree.name.normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "tree";
  if (format === "gedcom") {
    return {
      filename: `${slug}.ged`,
      contentType: "text/plain; charset=utf-8",
      body: buildGedcom(data.tree.name, data.people, data.relationships, now),
    };
  }
  const body = JSON.stringify(
    {
      format: "silsilah-tree",
      version: 1,
      exportedAt: now.toISOString(),
      tree: { name: data.tree.name },
      people: data.people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        givenName: p.givenName,
        familyName: p.familyName,
        nicknames: p.nicknames,
        gender: p.gender,
        birthDate: p.birthDate,
        deathDate: p.deathDate,
        birthPlace: p.birthPlace,
        notes: p.notes,
        isLiving: p.isLiving,
      })),
      // PARENT_CHILD: personA is the parent. SPOUSE: either order.
      relationships: data.relationships.map((r) => ({ type: r.type, personAId: r.personAId, personBId: r.personBId })),
    },
    null,
    2,
  );
  return { filename: `${slug}.json`, contentType: "application/json; charset=utf-8", body };
}
