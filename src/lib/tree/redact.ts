import type { Role } from "@/generated/prisma/enums";
import { treatAsLiving } from "./living";

export const HIDDEN_LIVING_FIELDS = [
  "birthDate",
  "birthYear",
  "birthPlace",
  "notes",
  "sourceBox",
  "sourceImageId",
] as const;

type Redactable = { isLiving: boolean | null } & Partial<
  Record<(typeof HIDDEN_LIVING_FIELDS)[number], unknown>
>;

export function shouldRedact(role: Role, hideLivingFromViewers: boolean, isLiving: boolean | null) {
  return role === "VIEWER" && hideLivingFromViewers && treatAsLiving(isLiving);
}

/**
 * Applied on the server before any person leaves an API route or server
 * component. Viewers of a tree with "hide living people" on see only the
 * name (and gender, which the chart needs to draw the node).
 */
export function redactPerson<T extends Redactable>(
  person: T,
  role: Role,
  hideLivingFromViewers: boolean,
): T & { redacted: boolean } {
  if (!shouldRedact(role, hideLivingFromViewers, person.isLiving)) {
    return { ...person, redacted: false };
  }
  const copy: Record<string, unknown> = { ...person, redacted: true };
  for (const field of HIDDEN_LIVING_FIELDS) {
    if (field in copy) copy[field] = null;
  }
  return copy as T & { redacted: boolean };
}
