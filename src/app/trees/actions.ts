"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz/session";
import { createTree } from "@/lib/trees";

export async function createTreeAction(formData: FormData) {
  const user = await requireUser();
  const tree = await createTree(db, user.id, String(formData.get("name") ?? ""));
  redirect(`/trees/${tree.id}`);
}
