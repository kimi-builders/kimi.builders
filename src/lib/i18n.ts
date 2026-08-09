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
  "nav.menu": { zh: "打开功能导航", en: "Open navigation" },
  "nav.closeMenu": { zh: "关闭功能导航", en: "Close navigation" },
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
  "err.commentEmpty": {
    zh: "评论内容不能为空",
    en: "Comment cannot be empty",
  },
  "err.generic": {
    zh: "操作失败,请重试",
    en: "Something went wrong — please try again",
  },
  /* ---- 操作反馈(toast)---- */
  "toast.commented": { zh: "评论已发布", en: "Comment posted" },
  "toast.saved": { zh: "已保存", en: "Saved" },
  "toast.deleted": { zh: "已删除", en: "Deleted" },
  "toast.privateOn": {
    zh: "已设为私密,仅自己可见",
    en: "Now private — only you can see it",
  },
  "toast.privateOff": { zh: "已恢复公开", en: "Back to public" },
  "toast.subscribed": {
    zh: "已订阅,有新讨论会通知你",
    en: "Subscribed — you'll be notified of new activity",
  },
  "toast.unsubscribed": { zh: "已取消订阅", en: "Unsubscribed" },
  "toast.voted": { zh: "投票成功", en: "Vote recorded" },
  "toast.failed": {
    zh: "操作失败,请重试",
    en: "Action failed — please try again",
  },
  "post.submitting": { zh: "提交中…", en: "Sending…" },
  /* ---- 个人主页 ---- */
  "nav.profile": { zh: "个人主页", en: "Profile" },
  "nav.settings": { zh: "设置", en: "Settings" },
  "prof.posts": { zh: "帖子", en: "Posts" },
  "prof.comments": { zh: "评论", en: "Comments" },
  "prof.likes": { zh: "获赞", en: "Likes" },
  "prof.joined": { zh: "{d} 加入", en: "Joined {d}" },
  "prof.edit": { zh: "编辑资料", en: "Edit profile" },
  "prof.noPosts": { zh: "还没有帖子。", en: "No posts yet." },
  "prof.noComments": { zh: "还没有评论。", en: "No comments yet." },
  "prof.commentedOn": { zh: "评论了", en: "commented on" },
  "prof.notFound": { zh: "没有这个用户。", en: "No such user." },
  /* ---- 设置 ---- */
  "set.title": { zh: "设置", en: "Settings" },
  "set.profile": { zh: "资料", en: "PROFILE" },
  "set.name": { zh: "显示名", en: "Display name" },
  "set.bio": { zh: "简介", en: "Bio" },
  "set.avatar": { zh: "头像 URL", en: "Avatar URL" },
  "set.avatarHint": {
    zh: "留空则不修改;头像默认来自登录平台。",
    en: "Leave empty to keep current. Your avatar comes from the login provider by default.",
  },
  "set.handleHint": {
    zh: "小写字母、数字、下划线;改了之后旧的主页链接会失效。",
    en: "Lowercase letters, digits, underscores. Changing it breaks old profile links.",
  },
  "set.save": { zh: "保存", en: "Save" },
  "set.saved": { zh: "已保存", en: "Saved" },
  "set.saving": { zh: "保存中…", en: "Saving…" },
  "set.prefs": { zh: "偏好", en: "PREFERENCES" },
  "set.aiMine": {
    zh: "允许 Kimi 小筑(AI)回复我的帖子和评论",
    en: "Allow Kimi bot (AI) to reply to my posts and comments",
  },
  "set.aiShow": {
    zh: "浏览时显示 AI 回复",
    en: "Show AI replies while browsing",
  },
  "set.locale": { zh: "界面语言", en: "Interface language" },
  "set.theme": { zh: "主题", en: "Theme" },
  "set.account": { zh: "账号", en: "ACCOUNT" },
  "set.linked": { zh: "已绑定的登录方式", en: "Linked sign-in methods" },
  "set.linkedSince": { zh: "绑定于 {d}", en: "linked {d}" },
  "set.email": { zh: "邮箱", en: "Email" },
  "set.loginRequired": { zh: "登录后才能修改设置:", en: "Log in to change settings:" },
  "err.handleTaken": { zh: "这个 handle 已被占用", en: "That handle is taken" },
  "err.handleInvalid": {
    zh: "handle 只能用小写字母、数字、下划线(28 字以内)",
    en: "Lowercase letters, digits and underscores only (28 max)",
  },
  "err.avatarInvalid": {
    zh: "头像 URL 需要以 http(s):// 开头",
    en: "Avatar URL must start with http(s)://",
  },
  "err.nameLong": {
    zh: "显示名太长了(64 字以内)",
    en: "Name too long (64 chars max)",
  },
  "err.bioLong": {
    zh: "简介太长了(300 字以内)",
    en: "Bio too long (300 chars max)",
  },
  /* ---- 占位页(未开发分区) ---- */
  "soon.headline": { zh: "这块还在建", en: "Under construction" },
  "soon.planned": { zh: "规划里有什么", en: "WHAT'S PLANNED" },
  "soon.cta": { zh: "先去社区逛逛", en: "Browse the community" },
  "soon.learn.desc": {
    zh: "知识库:新手指南、实战教程、提示词库、Skills 库、活动归档与运营月报。内容放在 GitHub 公开仓库里维护,飞书做国内镜像。",
    en: "The knowledge base: beginner guides, hands-on tutorials, prompt library, Skills library, event archive and monthly ops reports. Content lives in a public GitHub repo, mirrored to Feishu for CN readers.",
  },
  "soon.learn.items": {
    zh: "新手指南\n实战教程\n提示词与 Skills 库\n活动归档与运营月报",
    en: "Beginner guides\nHands-on tutorials\nPrompt & Skills library\nEvent archive & monthly reports",
  },
  "soon.works.desc": {
    zh: "作品库:社区成员用 Kimi 构建的真实作品墙,带截图和链接;发帖「晒作品」板块的优秀内容会收录到这里。",
    en: "The works gallery: real projects community members built with Kimi, with screenshots and links. The best of the Showcase board gets collected here.",
  },
  "soon.works.items": {
    zh: "成员作品墙\n投稿与收录\n与 Awesome 列表联动",
    en: "Member gallery\nSubmission & curation\nLinked with the Awesome list",
  },
  /* ---- 用量看板 ---- */
  "usage.intro": {
    zh: "以 Kimi 为主,汇总多种 AI 编程工具的 token 与活跃数据。Collector 只上传统计字段,不上传对话内容、完整文件路径或供应商凭据。",
    en: "Kimi-first usage analytics across multiple AI coding tools. The collector uploads metrics only — never conversation content, full file paths, or provider credentials.",
  },
  "usage.loginRequired": {
    zh: "登录后查看你的用量看板:",
    en: "Log in to see your usage dashboard:",
  },
  "usage.last30": { zh: "最近 30 天", en: "LAST 30 DAYS" },
  "usage.tokensIn": { zh: "输入", en: "input" },
  "usage.tokensOut": { zh: "输出", en: "output" },
  "usage.cached": { zh: "缓存命中", en: "cached" },
  "usage.calls": { zh: "次调用", en: "calls" },
  "usage.active": { zh: "活跃时长", en: "active" },
  "usage.tokensUnit": { zh: "tokens", en: "tokens" },
  "usage.syncStatus": { zh: "数据同步", en: "DATA SYNC" },
  "usage.noData": {
    zh: "还没有用量数据。新的设备授权同步正在接入中。",
    en: "No usage data yet. Device-authorized sync is being prepared.",
  },
  "usage.migrationNotice": {
    zh: "为保护账号,旧的全站共享密钥同步已停用。已有数据会继续保留。",
    en: "The legacy site-wide shared-secret sync has been retired to protect accounts. Existing data remains available.",
  },
  "usage.migrationDetail": {
    zh: "新的每用户、每设备授权正在接入;上线后你可以在这里连接、查看或撤销设备。",
    en: "Per-user, per-device authorization is coming next; you will be able to connect, inspect, and revoke devices here.",
  },
  "usage.lastSync": { zh: "最近同步:{t}", en: "Last synced {t}" },
  "works.submit": { zh: "提交作品", en: "Submit work" },
  "works.empty": {
    zh: "还没有作品。来挂第一个 —— 你用 Kimi 做的东西值得被看到。",
    en: "No works yet. Hang the first one — what you built with Kimi deserves to be seen.",
  },
  "works.visit": { zh: "访问", en: "Visit" },
  "works.repo": { zh: "源码", en: "Source" },
  "works.deleteConfirm": {
    zh: "确定删除这个作品?",
    en: "Delete this work?",
  },
  "works.newTitle": { zh: "提交作品", en: "Submit work" },
  "works.editTitle": { zh: "编辑作品", en: "Edit work" },
  "works.name": { zh: "作品名称", en: "Name" },
  "works.tagline": { zh: "一句话介绍", en: "Tagline" },
  "works.url": { zh: "作品链接", en: "URL" },
  "works.repoUrl": { zh: "仓库链接", en: "Repo URL" },
  "works.shot": { zh: "截图 URL(可选)", en: "Screenshot URL (optional)" },
  "works.tags": {
    zh: "标签(逗号分隔,最多 5 个)",
    en: "Tags (comma separated, max 5)",
  },
  "works.hint": {
    zh: "链接和仓库至少填一个;提交后展示在作品墙,可随时编辑或撤下。",
    en: "Add at least a URL or a repo link. It lands on the wall right away and you can edit or take it down anytime.",
  },
  "works.loginRequired": {
    zh: "登录后提交作品:",
    en: "Log in to submit your work:",
  },
  "err.workName": { zh: "作品名称必填", en: "Name is required" },
  "err.workNameLong": {
    zh: "名称太长了(120 字以内)",
    en: "Name too long (120 chars max)",
  },
  "err.workTaglineLong": {
    zh: "介绍太长了(300 字以内)",
    en: "Tagline too long (300 chars max)",
  },
  "err.workNoLink": {
    zh: "作品链接和仓库链接至少填一个",
    en: "Add at least a URL or a repo link",
  },
  "err.notOwnerWork": {
    zh: "只能编辑自己的作品",
    en: "You can only edit your own works",
  },
  "works.agents": { zh: "参与的 Agent", en: "Agents involved" },
  "works.agentsHint": {
    zh: "哪些 Agent 参与了这个项目(可多选)。",
    en: "Which agents took part in this project (multi-select).",
  },
  "works.authorLabel": { zh: "原作者(可选)", en: "Original author (optional)" },
  "works.authorLabelPh": {
    zh: "推荐别人的项目时填作者/团队名",
    en: "Author or team name when recommending someone else's project",
  },
  "works.authorLabelHint": {
    zh: "填了就是推荐站外项目:进 Awesome 列表、不进你的作品墙。",
    en: "Filled = recommending an external project: it goes to Awesome, not your works wall.",
  },
  "err.workAuthorLong": {
    zh: "原作者名太长了(120 字以内)",
    en: "Author name too long (120 chars max)",
  },
  "err.workNoAgent": {
    zh: "至少标记一个参与的 Agent",
    en: "Mark at least one agent involved",
  },
  /* ---- Awesome ---- */
  "awesome.intro": {
    zh: "全世界用 Kimi 构建的项目。收录口径很宽:Kimi 参与了构建、为 Kimi 生态做的应用、以 Kimi 为基座的项目都算 —— 不要求 100% 由 Kimi 完成,参与的 Agent 会标在卡片上。",
    en: "Projects built with Kimi around the world. The bar is deliberately low: Kimi took part, it's made for the Kimi ecosystem, or it's built on Kimi — it doesn't have to be 100% Kimi-made. Participating agents are badged on each card.",
  },
  "awesome.recommend": { zh: "推荐项目", en: "Recommend" },
  "awesome.all": { zh: "全部", en: "All" },
  "awesome.empty": {
    zh: "这个过滤条件下还没有项目。",
    en: "Nothing under this filter yet.",
  },
  "awesome.by": { zh: "by {name}", en: "by {name}" },
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
