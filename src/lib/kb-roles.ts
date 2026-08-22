/* Role vocabulary registry: the explore section's audience lens. Roles
   match the "who am I, what can I do with Kimi" entry mindset — a filter
   facet like the product lens, never a content shelf. The vocabulary
   registers all 16 at once and rendering shows only roles with content
   (zero counts never render); role landing pages (/explore/for/<role>)
   additionally require >=3 units (roleLandingEligible in explore.ts) —
   below the threshold, no page. */
export interface KbRole {
  /* Stable slug for payload.roles / URL ?role=. */
  id: string;
  zh: string;
  en: string;
}

export const KB_ROLES: KbRole[] = [
  { id: "student", zh: "学生", en: "Student" },
  { id: "lawyer", zh: "律师", en: "Lawyer" },
  { id: "doctor", zh: "医生", en: "Doctor" },
  { id: "teacher", zh: "老师", en: "Teacher" },
  { id: "ops", zh: "运营", en: "Operations" },
  { id: "growth", zh: "增长", en: "Growth" },
  { id: "hr", zh: "HR", en: "HR" },
  { id: "planning", zh: "企划", en: "Planning" },
  { id: "procurement", zh: "采购", en: "Procurement" },
  { id: "design", zh: "设计", en: "Designer" },
  { id: "rnd", zh: "研发", en: "R&D" },
  { id: "sales", zh: "销售", en: "Sales" },
  { id: "software", zh: "软件开发", en: "Software Dev" },
  { id: "marketing", zh: "市场", en: "Marketing" },
  { id: "creative", zh: "创意", en: "Creative" },
  { id: "director", zh: "导演", en: "Director" },
];

export function findKbRole(id: string): KbRole | undefined {
  return KB_ROLES.find((r) => r.id === id);
}

export function isKbRoleId(id: string): boolean {
  return KB_ROLES.some((r) => r.id === id);
}

export function kbRoleLabel(id: string, zh: boolean): string | null {
  const r = findKbRole(id);
  return r ? (zh ? r.zh : r.en) : null;
}
