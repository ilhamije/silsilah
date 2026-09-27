import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz/session";
import { badRequest, errorResponse, HttpError } from "@/lib/errors";
import { getLocaleFromCookies } from "@/i18n/locale";
import { runPageExtraction } from "@/lib/extraction/service";
import { MAX_IMAGE_BYTES, sniffImageType } from "@/lib/extraction/image-check";
import { PAGE_SCOPE_PATTERN } from "@/lib/ai/combine";

// Reading a dense page can take a while; 300 s is the Vercel Hobby maximum.
export const maxDuration = 300;

const fieldsSchema = z.object({
  pageIndex: z.coerce.number().int().min(0).max(49),
  totalPages: z.coerce.number().int().min(1).max(50),
  pageScope: z.string().regex(PAGE_SCOPE_PATTERN).optional(),
  knownPeople: z
    .string()
    .default("[]")
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "invalid JSON" });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(
          z.object({
            temp_id: z.string().max(40),
            full_name: z.string().max(200),
            birth_date: z.string().max(60).nullable(),
          }),
        )
        .max(1000),
    ),
});

/**
 * POST multipart/form-data: `image` (one compressed page) plus page info.
 * The image is read into memory, forwarded to the AI, and dropped: it is never
 * stored or logged.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/trees/[treeId]/extract">) {
  try {
    const { treeId } = await ctx.params;
    const user = await requireUser();

    const form = await request.formData().catch(() => {
      throw badRequest("invalid_form");
    });
    const file = form.get("image");
    if (!(file instanceof File)) throw badRequest("missing_image");
    if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "image_too_large");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImageType(bytes);
    if (!mediaType) throw new HttpError(415, "unsupported_image_type");

    const fields = fieldsSchema.safeParse({
      pageIndex: form.get("pageIndex"),
      totalPages: form.get("totalPages"),
      pageScope: form.get("pageScope") ?? undefined,
      knownPeople: form.get("knownPeople") ?? undefined,
    });
    if (!fields.success || fields.data.pageIndex >= fields.data.totalPages) {
      throw badRequest("invalid_fields", fields.error?.issues);
    }

    const result = await runPageExtraction(db, user.id, treeId, {
      image: { base64: Buffer.from(bytes).toString("base64"), mediaType },
      pageIndex: fields.data.pageIndex,
      pageScope: fields.data.pageScope,
      totalPages: fields.data.totalPages,
      knownPeople: fields.data.knownPeople,
      locale: await getLocaleFromCookies(),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
