import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz/session";
import { badRequest, errorResponse } from "@/lib/errors";
import { detectMerges } from "@/lib/merge/detect";
import { importReviewedTree } from "@/lib/import/service";

/** POST the confirmed review (see src/lib/import/schema.ts). */
export async function POST(request: Request, ctx: RouteContext<"/api/trees/[treeId]/import">) {
  try {
    const { treeId } = await ctx.params;
    const user = await requireUser();
    const body = await request.json().catch(() => {
      throw badRequest("invalid_json");
    });
    const result = await importReviewedTree(db, user.id, treeId, body);
    if (!result.alreadyImported) {
      after(() => detectMerges(db, treeId, { userId: user.id }).catch((e) => console.error("merge detection failed", e)));
    }
    return Response.json(result, { status: result.alreadyImported ? 200 : 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
