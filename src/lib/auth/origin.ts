/* 站点 canonical origin。
   生产部署在 Caddy 反代之后,req.url 的 origin 会变成内网地址
   (localhost:3210)——直接拼 OAuth redirect_uri / 回调落点 / 邮件链接会全部
   污染成内网地址;纯请求 origin 又有 Host 头注入风险。
   统一走 NEXT_PUBLIC_SITE_URL(构建期注入、部署工作流校验过的 https origin),
   本地开发未设置时回退请求 origin。 */
export function canonicalOrigin(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
  ).replace(/\/+$/, "");
}
