import { z } from "zod";
import { extractionSchema } from "@/lib/ai/schema";
import { PAGE_SCOPE_PATTERN } from "@/lib/ai/combine";
import { personFieldsSchema } from "@/lib/people";

/*
 * What the review screen sends when the user presses Confirm. Validated on
 * the server; the browser builds it with toImportPayload().
 */

export const IMPORT_ID_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;
export const MAX_IMPORT_PEOPLE = 2000;

export const importPayloadSchema = z.object({
  /** Client-generated; makes a double-submitted Confirm harmless. */
  importId: z.string().regex(IMPORT_ID_PATTERN),
  pages: z
    .array(
      z.object({
        key: z.string().regex(PAGE_SCOPE_PATTERN),
        pageIndex: z.number().int().min(0).max(49),
        model: z.string().max(80).nullable(),
        extraction: extractionSchema,
      }),
    )
    .max(50),
  people: z
    .array(
      z.object({
        ref: z.string().min(1).max(64),
        /** Same person as someone already in the tree: link to them, don't create. */
        existingId: z.string().max(40).nullable(),
        fields: personFieldsSchema,
        pageKey: z.string().regex(PAGE_SCOPE_PATTERN).nullable(),
        bbox: z.array(z.number().min(0).max(1)).length(4).nullable(),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_PEOPLE),
  relationships: z
    .array(
      z.object({
        type: z.enum(["PARENT_CHILD", "SPOUSE"]),
        from: z.string().min(1).max(64), // parent, for PARENT_CHILD
        to: z.string().min(1).max(64),
      }),
    )
    .max(MAX_IMPORT_PEOPLE * 4),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;
export type ImportPayloadInput = z.input<typeof importPayloadSchema>;
