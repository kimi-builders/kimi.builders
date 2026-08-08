/* UI 语言:字典 + t()。纯数据纯函数,客户端/服务端随便引。
   需要读请求态的 getLocale 在 ./i18n-server(next/headers,服务端专属)。
   优先级(v2 决策 5 的 UI 侧):手动切换 cookie kb_locale > 账号 users.locale
   > Accept-Language 推断 > 默认 zh。 */

export type Locale = "zh" | "en";

const DICT = {
  /* ---- 左栏 / 顶栏导航 ---- */
  "nav.community": { zh: "社区", en: "Community" },
  "nav.learn": { zh: "知识库", en: "Learn" },
  "nav.works": { zh: "作品", en: "Works" },
  "nav.usage": { zh: "用量", en: "Usage" },
  "nav.awesome": { zh: "Awesome", en: "Awesome" },
  "nav.about": { zh: "关于", en: "About" },
  "nav.post": { zh: "发帖", en: "Post" },
  "nav.soon": { zh: "SOON", en: "SOON" },
  "nav.collapse": { zh: "收起导航", en: "Collapse" },
  "nav.expand": { zh: "展开导航", en: "Expand" },
  /* ---- 右栏 ---- */
  "side.browse": { zh: "浏览社区", en: "BROWSE" },
  "side.all": { zh: "全部讨论", en: "All threads" },
  "side.subs": { zh: "我的订阅", en: "Subscribed" },
  "side.about": { zh: "关于 KIMI.BUILDERS", en: "ABOUT KIMI.BUILDERS" },
  "side.aboutBody": {
    zh: "Kimi 用户自建的公益 builder 社区(非官方)。并肩探索,一起构建。",
    en: "A user-built, non-commercial community of Kimi builders (unofficial). Explore together, build together.",
  },
  "side.hot": { zh: "7 日热门", en: "TRENDING (7D)" },
  "side.hotEmpty": {
    zh: "还没有足够的讨论。",
    en: "Not enough discussion yet.",
  },
  "side.stats": { zh: "社区数据", en: "STATS" },
  "side.members": { zh: "成员", en: "members" },
  "side.posts": { zh: "帖子", en: "posts" },
  "side.comments": { zh: "评论", en: "comments" },
  "side.newMembers": { zh: "新成员", en: "NEW MEMBERS" },
  "side.hide": {
    zh: "隐藏侧栏(留下的小按钮可重开)",
    en: "Hide sidebar (a small button stays to reopen)",
  },
  "side.show": { zh: "显示侧栏", en: "Show sidebar" },
  /* ---- feed ---- */
  "feed.hot": { zh: "热门", en: "Hot" },
  "feed.new": { zh: "最新", en: "New" },
  "feed.sub": { zh: "订阅", en: "Subscribed" },
  "feed.quickPost": {
    zh: "有什么新鲜事?(支持 Markdown)",
    en: "What's happening? (Markdown supported)",
  },
  "feed.empty": {
    zh: "还没有帖子。来发第一帖 —— 你建的这个社区,第一条内容也该是你的。",
    en: "No posts yet. Start the first thread — you built this place, the first word should be yours.",
  },
  "feed.emptySub": {
    zh: "还没有订阅任何帖子 —— 在帖子页点「订阅」,重点讨论就会聚到这里。",
    en: "Nothing subscribed yet — hit Subscribe on a thread and it will gather here.",
  },
  /* ---- 帖子详情 ---- */
  "post.comments": { zh: "{n} 条评论", en: "{n} comments" },
  "post.commentPh": {
    zh: "写下你的评论(支持 Markdown)…",
    en: "Write a comment (Markdown supported)…",
  },
  "post.comment": { zh: "评论", en: "Comment" },
  "post.loginToComment": {
    zh: "登录后参与评论:",
    en: "Log in to join the discussion:",
  },
  "post.up": { zh: "点赞", en: "Upvote" },
  "post.unup": { zh: "取消点赞", en: "Remove upvote" },
  "post.loginToUpvote": { zh: "登录后点赞", en: "Log in to upvote" },
  "post.subscribe": { zh: "订阅", en: "Subscribe" },
  "post.subscribed": { zh: "已订阅", en: "Subscribed" },
  "post.unsubscribe": { zh: "取消订阅", en: "Unsubscribe" },
  "post.share": { zh: "分享", en: "Share" },
  "post.copied": { zh: "已复制", en: "Copied" },
  "post.shareAria": { zh: "分享(复制链接)", en: "Share (copy link)" },
  "post.vote": { zh: "投票", en: "Vote" },
  "post.votesTotal": { zh: "共 {n} 票", en: "{n} votes" },
  "post.loginToVote": { zh: "登录后可投票", en: "Log in to vote" },
  "post.typeLink": { zh: "链接", en: "Link" },
  "post.typePoll": { zh: "投票", en: "Poll" },
  "post.reply": { zh: "回复", en: "Reply" },
  "post.replyTo": { zh: "回复 {name}", en: "Reply to {name}" },
  "post.replying": { zh: "正在回复 {name}", en: "Replying to {name}" },
  "post.edit": { zh: "编辑", en: "Edit" },
  "post.delete": { zh: "删除", en: "Delete" },
  "post.deleteConfirm": {
    zh: "确定删除这篇帖子?删除后不可恢复。",
    en: "Delete this post? This cannot be undone.",
  },
  "post.commentDeleteConfirm": {
    zh: "删除这条评论?",
    en: "Delete this comment?",
  },
  "post.save": { zh: "保存", en: "Save" },
  "post.cancel": { zh: "取消", en: "Cancel" },
  "post.edited": { zh: "已编辑", en: "edited" },
  "post.makePrivate": { zh: "设为私密", en: "Make private" },
  "post.makePublic": { zh: "设为公开", en: "Make public" },
  "post.private": { zh: "私密", en: "Private" },
  "post.privateHint": {
    zh: "私密帖子仅自己可见",
    en: "Only you can see this post",
  },
  "post.down": { zh: "点踩(减少看到此帖)", en: "Downvote (see less of this)" },
  "post.undown": { zh: "取消点踩", en: "Remove downvote" },
  "post.dimmed": {
    zh: "被较多人点踩,已淡化显示",
    en: "Heavily downvoted, dimmed",
  },
  /* ---- 消息通知 ---- */
  "notif.title": { zh: "消息", en: "Notifications" },
  "notif.empty": {
    zh: "还没有消息。有人评论你关注的帖子、或回复你的评论时,会出现在这里。",
    en: "Nothing yet. Replies to your comments and new discussion on posts you follow will show up here.",
  },
  "notif.comment": { zh: "评论了你关注的帖子", en: "commented on a post you follow" },
  "notif.reply": { zh: "回复了你的评论", en: "replied to your comment" },
  "notif.loginRequired": { zh: "登录后查看消息:", en: "Log in to see notifications:" },
  /* ---- 发帖 ---- */
  "form.pageTitle": { zh: "发帖", en: "New post" },
  "form.text": { zh: "文字", en: "Text" },
  "form.link": { zh: "链接", en: "Link" },
  "form.poll": { zh: "投票", en: "Poll" },
  "form.title": { zh: "标题(可选)", en: "Title (optional)" },
  "form.bodyText": {
    zh: "正文(支持 Markdown)",
    en: "Body (Markdown supported)",
  },
  "form.bodyOpt": {
    zh: "补充说明(可选,支持 Markdown)",
    en: "Details (optional, Markdown supported)",
  },
  "form.pollOpts": { zh: "投票选项(2–8 个)", en: "Options (2–8)" },
  "form.addOpt": { zh: "+ 添加选项", en: "+ Add option" },
  "form.aiReply": {
    zh: "允许 Kimi 小筑(AI)回复本帖",
    en: "Allow Kimi bot (AI) to reply",
  },
  "form.private": {
    zh: "私密发布(仅自己可见)",
    en: "Post privately (only visible to me)",
  },
  "edit.pageTitle": { zh: "编辑帖子", en: "Edit post" },
  "err.notOwner": { zh: "只能编辑自己的帖子", en: "You can only edit your own posts" },
  "form.submit": { zh: "发布", en: "Post" },
  "form.posting": { zh: "发布中…", en: "Posting…" },
  "form.loginRequired": { zh: "发帖需要登录:", en: "Log in to post:" },
  /* ---- 登录 chip ---- */
  "auth.login": { zh: "登录", en: "Log in" },
  "auth.logout": { zh: "退出", en: "Log out" },
  /* ---- 表单错误 ---- */
  "err.login": { zh: "请先登录", en: "Please log in first" },
  "err.unknownType": { zh: "未知帖子类型", en: "Unknown post type" },
  "err.unknownCat": { zh: "未知板块", en: "Unknown category" },
  "err.empty": {
    zh: "标题和正文至少填一项",
    en: "Add a title or some body text",
  },
  "err.titleLong": {
    zh: "标题太长了(200 字以内)",
    en: "Title too long (200 chars max)",
  },
  "err.linkInvalid": {
    zh: "链接需要以 http(s):// 开头",
    en: "Link must start with http(s)://",
  },
  "err.pollMin": {
    zh: "投票至少需要 2 个选项",
    en: "A poll needs at least 2 options",
  },
  /* ---- aria ---- */
  "aria.toLight": { zh: "切换到亮色主题", en: "Switch to light theme" },
  "aria.toDark": { zh: "切换到暗色主题", en: "Switch to dark theme" },
  "aria.lang": { zh: "切换语言 / Switch language", en: "Switch language / 切换语言" },
} as const;

export type I18nKey = keyof typeof DICT;

export function t(
  locale: Locale,
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = DICT[key][locale];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}
