/* cron 路由鉴权(20260822 P2-4):Bearer CRON_SECRET。
   - 恒时比较:两侧先 sha256 再 timingSafeEqual——比较时长不随凭据前缀变化,
     也不泄露 header 长度(直接比 Buffer 会因长度不等提前返回);
   - 密钥未配置与凭据错误统一 false/401:外部无法探测「是否配了密钥」。 */
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}
