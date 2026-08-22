/* OAuth entry button row: shared by the login page and gated pages'
   login invitation cards — the site's single source for OAuth entries,
   so the styling never drifts. Server-safe (plain <a>, no hooks);
   next is the redirect path (empty = no param). */
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import GithubIcon from "@/app/(app)/_components/GithubIcon";

export default function OAuthButtons({
  next,
  block = false,
}: {
  /* The post-login redirect path (e.g. /usage); empty = no next. */
  next?: string;
  /* true = the login page's stacked block (default); false = the
     invitation card's narrow inline row. */
  block?: boolean;
}) {
  const query = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const base = block
    ? "flex items-center justify-center gap-2 rounded-lg border border-line bg-bg/40 px-4 py-2.5 font-mono text-xs text-paper transition-colors hover:border-ui-blue"
    : "inline-flex min-h-9 items-center rounded-lg border border-line px-4 font-mono text-xs text-paper transition-colors hover:border-ui-blue hover:text-ui-blue";
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
