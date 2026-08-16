/* OAuth 入口按钮行(20260919 从 LoginContent 抽出):登录页与各受限页的
   登录引导卡共用——全站 OAuth 入口只有这一份事实源,样式永不漂移。
   服务端安全(纯 <a>,无 hook);next 为回跳路径(空 = 不带参)。 */
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import GithubIcon from "@/app/(app)/_components/GithubIcon";

export default function OAuthButtons({
  next,
  block = false,
}: {
  /* 登录成功后的回跳路径(如 /usage);空串 = 不带 next */
  next?: string;
  /* true = 登录页的块状纵排(默认);false = 引导卡的行内窄排 */
  block?: boolean;
}) {
  const query = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const base = block
    ? "flex items-center justify-center gap-2 rounded-lg border border-line bg-bg/40 px-4 py-2.5 font-mono text-xs text-paper transition-colors hover:border-blue"
    : "inline-flex min-h-9 items-center rounded-lg border border-line px-4 font-mono text-[11px] text-paper transition-colors hover:border-blue hover:text-blue";
  return (
    <>
      <a href={`/api/auth/github${query}`} className={base}>
        <GithubIcon size={block ? 15 : 13} />
        GitHub
      </a>
      <a href={`/api/auth/google${query}`} className={base}>
        <GoogleColor size={block ? 15 : 13} />
        Google
      </a>
    </>
  );
}
