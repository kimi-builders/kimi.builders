/* OAuth 提供方:GitHub / Google 授权跳转、code 换 token、拉取资料。
   不引第三方 auth 库 —— 两家都是标准 OAuth2,手写几十个请求头就够,
   账号结构完全落在我们自己的 users + oauth_accounts 表上。 */
import { randomBytes } from "crypto";

export type Provider = "github" | "google";
export const PROVIDERS: Provider[] = ["github", "google"];

export const STATE_COOKIE = "kb_oauth_state";

export interface OAuthProfile {
  providerAccountId: string;
  handle: string; // 建议 handle(入库前去重)
  name: string;
  email: string | null;
  avatarUrl: string;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function createState(): string {
  return randomBytes(16).toString("hex");
}

export function authorizeUrl(
  provider: Provider,
  opts: { redirectUri: string; state: string },
): string {
  if (provider === "github") {
    const p = new URLSearchParams({
      client_id: requireEnv("AUTH_GITHUB_ID"),
      redirect_uri: opts.redirectUri,
      scope: "read:user user:email",
      state: opts.state,
    });
    return `https://github.com/login/oauth/authorize?${p}`;
  }
  const p = new URLSearchParams({
    client_id: requireEnv("AUTH_GOOGLE_ID"),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/* code → token → 资料,统一归一成 OAuthProfile */
export async function fetchProfile(
  provider: Provider,
  code: string,
  redirectUri: string,
): Promise<OAuthProfile> {
  return provider === "github"
    ? fetchGitHubProfile(code, redirectUri)
    : fetchGoogleProfile(code, redirectUri);
}

async function fetchGitHubProfile(
  code: string,
  redirectUri: string,
): Promise<OAuthProfile> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("AUTH_GITHUB_ID"),
      client_secret: requireEnv("AUTH_GITHUB_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("github token exchange failed");
  }
  const headers = {
    Authorization: `Bearer ${tokenJson.access_token}`,
    "User-Agent": "kimi.builders", // GitHub API 强制要求
    Accept: "application/vnd.github+json",
  };
  const user = (await (
    await fetch("https://api.github.com/user", { headers })
  ).json()) as {
    id: number;
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string;
  };
  let email = user.email ?? null;
  if (!email) {
    // 用户隐藏了公开邮箱时,从 /user/emails 取主邮箱
    const emails = (await (
      await fetch("https://api.github.com/user/emails", { headers })
    ).json()) as { email: string; primary: boolean; verified: boolean }[];
    if (Array.isArray(emails)) {
      const pick = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      email = pick?.email ?? null;
    }
  }
  return {
    providerAccountId: String(user.id),
    handle: user.login ?? "",
    name: user.name || user.login || "",
    email,
    avatarUrl: user.avatar_url ?? "",
  };
}

async function fetchGoogleProfile(
  code: string,
  redirectUri: string,
): Promise<OAuthProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: requireEnv("AUTH_GOOGLE_ID"),
      client_secret: requireEnv("AUTH_GOOGLE_SECRET"),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("google token exchange failed");
  }
  const info = (await (
    await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
  ).json()) as {
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
  };
  return {
    providerAccountId: info.sub,
    handle: info.email?.split("@")[0] ?? info.name ?? "",
    name: info.name ?? "",
    email: info.email ?? null,
    avatarUrl: info.picture ?? "",
  };
}
