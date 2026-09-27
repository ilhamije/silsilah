"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz/session";
import { createTree } from "@/lib/trees";
import { isTemplateId } from "@/lib/tree/templates";

export async function createTreeAction(formData: FormData) {
  const user = await requireUser();
  const tree = await createTree(db, user.id, String(formData.get("name") ?? ""));
  // A template opens as an unsaved draft on the review screen, to be filled in.
  const template = formData.get("template");
  redirect(isTemplateId(template) ? `/trees/${tree.id}/review?template=${template}` : `/trees/${tree.id}`);
}
