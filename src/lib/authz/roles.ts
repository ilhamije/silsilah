import type { Role } from "@/generated/prisma/enums";

const rank: Record<Role, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export function hasRole(actual: Role, required: Role): boolean {
  return rank[actual] >= rank[required];
}

/** Everything a tree member might try to do, and the minimum role for it. */
export const permissions = {
  "tree.read": "VIEWER",
  "tree.leave": "VIEWER",
  "edit.suggest": "VIEWER",
  "person.write": "EDITOR",
  "relationship.write": "EDITOR",
  "image.upload": "EDITOR",
  "merge.decide": "EDITOR",
  "edit.review": "EDITOR",
  "activity.read": "VIEWER",
  "tree.settings": "OWNER",
  "member.manage": "OWNER",
  "invite.manage": "OWNER",
  "tree.delete": "OWNER",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof permissions;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && hasRole(role, permissions[permission]);
}
