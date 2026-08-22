/* 职业词表注册表(20260821 探索「货架 + 透镜」改版):探索区的人群透镜。
   职业是「我是谁,能用 Kimi 干嘛」的进入心智——与产品透镜同为筛选
   facet,不做内容架子。词表一次全注册(16 项),渲染只出有内容的
   (0 计数不出);职业落地页(/explore/for/<role>)另有 ≥3 单元门槛
   (explore.ts 的 roleLandingEligible),门槛未到不建页面。 */
export interface KbRole {
  /* payload.roles / URL ?role= 用的稳定 slug */
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
