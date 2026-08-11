/* 作品媒体 key 校验(20260826_work_media):纯函数,无服务端依赖,
   客户端组件(WorkMediaFields)与 action 层共用。
   key 只能来自 POST /api/upload 的颁发形状(内容寻址,见 storage.ts mediaKey);
   写库前再校验一次,挡住手搓的隐藏字段值。logo 仅 logo/ 前缀,配图仅 image/ 前缀。 */
export const WORK_IMAGE_MAX = 9;

const WORK_MEDIA_KEY_RE = /^(logo|image)\/\d{6}\/[0-9a-f]{16}\.webp$/;

export function isWorkMediaKey(key: string): boolean {
  return WORK_MEDIA_KEY_RE.test(key);
}

/* Logo key:空串 = 无 Logo;非空必须是 logo/ 前缀的合法媒体 key。 */
export function isWorkLogoKey(key: string): boolean {
  return key === "" || (isWorkMediaKey(key) && key.startsWith("logo/"));
}

/* 配图 key 数组:≤9 张,全部 image/ 前缀的合法 key(第一张 = 封面,顺序即语义)。 */
export function areWorkImageKeys(keys: string[]): boolean {
  return (
    keys.length <= WORK_IMAGE_MAX &&
    keys.every((k) => isWorkMediaKey(k) && k.startsWith("image/"))
  );
}

/* 表单隐藏字段 imageKeys(JSON 字符串)解析:空 = 无配图;
   非法 JSON / 非字符串数组 → null(调用方按校验失败处理,不静默吞掉)。 */
export function parseWorkImageKeysInput(raw: string): string[] | null {
  if (!raw.trim()) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || v.some((k) => typeof k !== "string")) return null;
    return v as string[];
  } catch {
    return null;
  }
}
