import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz/session";
import { badRequest, errorResponse } from "@/lib/errors";
import { exportTree } from "@/lib/export-tree";

/** GET ?format=gedcom|json. Any member can export; Viewers get the same redaction as the chart. */
export async function GET(request: Request, ctx: RouteContext<"/api/trees/[treeId]/export">) {
  try {
    const { treeId } = await ctx.params;
    const user = await requireUser();
    const format = new URL(request.url).searchParams.get("format") ?? "gedcom";
    if (format !== "gedcom" && format !== "json") throw badRequest("invalid_format");
    const file = await exportTree(db, user.id, treeId, format);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
