export const MODULE_KEYS = [
  "chat",
  "customers",
  "catalog",
  "baskets",
  "offers",
  "cart",
  "orders",
  "human_inbox",
  "ai",
  "automation",
  "analytics",
  "whatsapp",
  "instagram",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const DONA_ANTONIA_V1_MODULES: ReadonlySet<ModuleKey> = new Set([
  "chat",
  "customers",
  "catalog",
  "baskets",
  "offers",
  "cart",
  "orders",
  "human_inbox",
  "ai",
]);

export type OrganizationRole =
  | "owner"
  | "admin"
  | "manager"
  | "agent"
  | "viewer";

export function canOperateCustomers(role: OrganizationRole): boolean {
  return role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "agent";
}

export function canManageModules(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin";
}
