import { isWorkKind } from "./work-kinds";

/* Source is immutable. Legacy recommendations remain editable by their
   original recommender until repository ownership takes over. */
export function workEditFieldsAllowed(source: string, fields: {
  authorLabel: string; scope: string | null; kind: string; intent?: string;
}): boolean {
  if (!isWorkKind(fields.kind) || (fields.intent !== undefined && fields.intent !== source)) return false;
  if (source === "site") return fields.authorLabel === "" && fields.scope === null;
  return source === "awesome" && fields.authorLabel.trim().length > 0 &&
    ["base", "eco", "part"].includes(fields.scope ?? "");
}
