/* 客户端 IP 提取(纯,20260822 P1-1):限流身份与匿名访客统计共用同一可信序。
   XFF 首段是请求方自带值,伪造它即可绕过一切「仅 IP」限流(注册/忘记密码/
   设备码),故弃用。可信序:
   1) cf-connecting-ip —— Cloudflare 边缘权威覆写(生产拓扑 CF → Caddy);
      前提是源站只把回源流量放行给 CF 网段,否则可被直连伪造(见 infra.md);
   2) x-real-ip —— 反代显式设置的直连地址;
   3) XFF 最右段 —— 最近一跳可信代理(Caddy)追加,客户端控制不了右端;
      流量经 CF 时该段是 CF 边缘 IP,粒度变粗(多访客共享)——宁粗不假。
   全缺(本机直连开发)返回 null,调用方自行回落。 */
export function trustedClientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const rightmost = headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return rightmost || null;
}
