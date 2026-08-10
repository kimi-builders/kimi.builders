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
  "side.featured": { zh: "编辑精选", en: "EDITOR'S PICKS" },
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
  "post.poster": { zh: "海报", en: "Poster" },
  "post.posterAria": { zh: "下载分享海报图片", en: "Download share poster image" },
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
  "post.loadMore": {
    zh: "加载更多评论(还有 {n} 条)",
    en: "Load more comments ({n} more)",
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
  "auth.email": { zh: "邮箱", en: "Email" },
  "modal.close": { zh: "关闭", en: "Close" },
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
  /* ---- 社区写操作限流(P1-5):{s} = 距窗口重置的等待秒数 ---- */
  "err.ratePost": {
    zh: "发帖太频繁了,请 {s} 秒后再试",
    en: "Posting too fast — try again in {s}s",
  },
  "err.rateComment": {
    zh: "评论太频繁了,请 {s} 秒后再试",
    en: "Commenting too fast — try again in {s}s",
  },
  "err.rateVote": {
    zh: "投票太频繁了,请 {s} 秒后再试",
    en: "Voting too fast — try again in {s}s",
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
  "set.privacy": { zh: "隐私与公开", en: "PRIVACY & VISIBILITY" },
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
  /* ---- 编辑精选(每周精选 v0)---- */
  "featured.badge": { zh: "编辑精选", en: "EDITOR'S PICK" },
  "featured.kindPost": { zh: "帖子", en: "POST" },
  "featured.kindWork": { zh: "作品", en: "WORK" },
  "featured.by": { zh: "— @{handle} 精选", en: "— picked by @{handle}" },
  "featured.set": { zh: "设为精选", en: "Feature" },
  "featured.unset": { zh: "取消精选", en: "Unfeature" },
  "featured.reasonPh": {
    zh: "精选理由(必填,280 字以内)",
    en: "Reason (required, 280 chars max)",
  },
  "toast.featured": { zh: "已设为精选", en: "Featured" },
  "toast.unfeatured": { zh: "已取消精选", en: "Removed from featured" },
  "err.forbidden": {
    zh: "需要管理员或编辑权限",
    en: "Admin or moderator role required",
  },
  "err.reasonRequired": {
    zh: "请填写精选理由",
    en: "Add a reason for featuring",
  },
  "err.reasonLong": {
    zh: "理由太长了(280 字以内)",
    en: "Reason too long (280 chars max)",
  },
  /* ---- 首页 ---- */
  "home.logoAlt": {
    zh: "kimi.builders 标志 —— 月球暗面的一轮纸月,两颗伴星环绕运行",
    en: "kimi.builders — a paper crescent on the dark side of the moon, with two companion stars in orbit",
  },
  "home.heroSub": {
    zh: "并肩探索,一起构建 —— 社区正在生长。",
    en: "Explore together, build together — the community is growing.",
  },
  "home.cta": { zh: "进入社区", en: "Enter the community" },
  "home.tokens": { zh: "累计 tokens", en: "total tokens" },
  "home.featured": { zh: "本周精选", en: "PICKS OF THE WEEK" },
  "home.featuredSub": {
    zh: "编辑署名的人为定夺,不是算法。",
    en: "Signed by human editors — judgment, not algorithm.",
  },
  "home.join": { zh: "入群 / 订阅", en: "JOIN & FOLLOW" },
  "home.joinDisc": {
    zh: "问答、想法、日常讨论都在 GitHub Discussions,欢迎随时开帖。",
    en: "Questions, ideas and day-to-day talk live in GitHub Discussions — jump in anytime.",
  },
  "home.joinDiscCta": { zh: "参与讨论", en: "Join discussions" },
  "home.joinAwesome": {
    zh: "全世界用 Kimi 构建的项目清单,你的作品也值得上榜。",
    en: "Projects built with Kimi around the world — yours belongs on the list too.",
  },
  "home.joinAwesomeCta": { zh: "浏览清单", en: "Browse the list" },
  "home.joinMail": {
    zh: "合作、反馈、投稿,或者只是想聊聊,都欢迎写信。",
    en: "Collaboration, feedback, submissions — or just say hi.",
  },
  /* ---- aria ---- */
  "aria.toLight": { zh: "切换到亮色主题", en: "Switch to light theme" },
  "aria.toDark": { zh: "切换到暗色主题", en: "Switch to dark theme" },
  "aria.lang": { zh: "切换语言 / Switch language", en: "Switch language / 切换语言" },
  /* ---- 社区用量榜(P1-1;独立分区,降低合并冲突面) ---- */
  "lb.title": { zh: "社区用量榜", en: "Community leaderboard" },
  "lb.intro": {
    zh: "打开了「参与社区榜」开关的成员,其周期聚合用量会出现在这里。",
    en: "Members who turned on leaderboard sharing have their period aggregates listed here.",
  },
  "lb.period7": { zh: "近 7 天", en: "7D" },
  "lb.period30": { zh: "近 30 天", en: "30D" },
  "lb.colRank": { zh: "名次", en: "RANK" },
  "lb.colMember": { zh: "成员", en: "MEMBER" },
  "lb.colTokens": { zh: "周期 TOKEN", en: "TOKENS" },
  "lb.colDays": { zh: "活跃天数", en: "ACTIVE DAYS" },
  "lb.days": { zh: "{n} 天", en: "{n}d" },
  "lb.trust": {
    zh: "数据来自成员自愿同步的自报日志,可能不完整;仅含周期聚合数字,作为社区参考,不是可验证的计量凭证。",
    en: "Self-reported logs synced voluntarily by members and may be incomplete; period aggregates only, as a community reference — not verified metering.",
  },
  "lb.scope": {
    zh: "口径:仅主动 opt-in 的成员 · 只公开聚合 token 与活跃天数 · 不含项目名、设备或时段明细 · 活跃天数按 UTC 自然日计。",
    en: "Scope: opt-in members only · aggregate tokens and active days only · no project names, devices, or time-of-day detail · active days counted in UTC.",
  },
  "lb.empty": { zh: "还没有成员公开用量。", en: "No members are sharing usage yet." },
  "lb.emptyHint": {
    zh: "榜单完全自愿:在用量中心的隐私设置里打开「参与社区榜」,你的周期聚合就会出现在这里。",
    en: "The board is fully opt-in: turn on leaderboard sharing in your usage privacy settings and your period aggregates will appear here.",
  },
  "lb.emptyCta": {
    zh: "去开启「参与社区榜」",
    en: "Turn on leaderboard sharing",
  },
  "lb.loadError": {
    zh: "榜单加载失败,请稍后重试。",
    en: "Failed to load the leaderboard. Please try again later.",
  },
  "lb.optin": { zh: "参与社区榜", en: "Join the community leaderboard" },
  "lb.optinHint": {
    zh: "开启后公开你的周期聚合 token 与活跃天数(社区榜、个人主页热力图共用此开关),不含项目名、设备或时间明细。作品徽章为声明制,不受此开关影响。",
    en: "Publishes your period aggregate tokens and active days — one switch shared by the leaderboard and profile heatmap. Never includes project names, devices, or time detail. Work badges are claim-based and not affected by this switch.",
  },
  "lb.entry": { zh: "社区用量榜", en: "Community leaderboard" },
  "lb.entryHint": {
    zh: "自愿公开成员的周期聚合排名:24 小时 / 7 天 / 30 天,含总榜与分工具、分模型榜。",
    en: "Period aggregates from opted-in members: 24H / 7D / 30D — overall plus per-tool and per-model boards.",
  },
  /* ---- 社区用量榜增强(24H 周期 / 分工具分模型榜 / 我的排名 / 分享;独立分区,降低合并冲突面) ---- */
  "lb.period24": { zh: "24 小时", en: "24H" },
  "lb.mine": { zh: "我的排名", en: "MY RANK" },
  "lb.mineTokens": { zh: "TOKEN 总榜", en: "TOKENS" },
  "lb.mineDays": { zh: "活跃天数", en: "ACTIVE DAYS" },
  "lb.mineCost": { zh: "预估费用", en: "EST. COST" },
  "lb.mineNoData": {
    zh: "本周期暂无同步数据,下个周期再来。",
    en: "No synced data in this period yet.",
  },
  "lb.mineOptin": {
    zh: "你还没有开启「参与社区榜」公开开关,开启后即可参与各榜排名。",
    en: "Leaderboard sharing is off — turn it on to join the rankings.",
  },
  "lb.mineOptinCta": { zh: "去开启公开开关", en: "Turn it on" },
  "lb.mineCostNote": {
    zh: "名次按周期计,超出 TOP 50 显示 50+;费用名次在总榜 TOP 50 成员内按估费排序。",
    en: "Ranks are per period; beyond TOP 50 shows 50+. Cost rank is sorted by estimate within the top-50 board.",
  },
  "lb.boardAll": { zh: "总榜", en: "OVERALL" },
  "lb.boardSource": { zh: "分工具榜", en: "BY TOOL" },
  "lb.boardModel": { zh: "分模型榜", en: "BY MODEL" },
  "lb.colCost": { zh: "预估费用", en: "EST. COST" },
  "lb.dimEmpty": {
    zh: "该周期内暂无此维度的公开数据。",
    en: "No public data for this dimension in this period.",
  },
  "lb.costScope": {
    zh: "估费口径:服务端版本化价格表的 API 等价估算(USD),不代表订阅账单;未定价部分照常统计但不计费。",
    en: "Costs are API-equivalent estimates (USD) from the server versioned pricing table, not subscription bills; unpriced usage is counted but never billed.",
  },
  /* ---- S2-2:主页页签 / 作品徽章 / 列表分页(独立分区,降低合并冲突面) ----
     注:works.badge / works.badgeTitle 已随声明制(20260822_work_claims)改口径。 */
  "prof.works": { zh: "作品", en: "Works" },
  "prof.usage": { zh: "用量", en: "Usage" },
  "prof.noWorks": { zh: "还没有作品。", en: "No works yet." },
  "works.badge": {
    zh: "声明构建投入 {n} tokens",
    en: "Declared build effort · {n} tokens",
  },
  "works.badgeTitle": {
    zh: "由作者声明,系统按可验证总量封顶校验,非精确计量",
    en: "Declared by the author, capped by their verifiable total — not precise metering",
  },
  "pager.loadMore": { zh: "加载更多", en: "Load more" },
  "pager.loading": { zh: "加载中…", en: "Loading…" },
  /* ---- Demo Night(S3,P3 提前;独立分区,降低合并冲突面) ---- */
  "dn.title": { zh: "Demo Night", en: "Demo Night" },
  "dn.intro": {
    zh: "builder 的线上分享夜:有人演示正在做的东西,有人到场见证。身体一次只能在一个地方 —— 到场本身就是稀缺背书,这不是一场划过就算的直播。报名即公开:你的 handle 会署进本页的到场名单,先到场先署名。",
    en: "An online show-and-tell for builders: someone demos what they're building, others show up to witness it. A body can only be in one place at a time — showing up is itself a scarce endorsement; this is not a stream you scroll past. RSVP is public: your handle joins the attendee list on this page, first come, first signed.",
  },
  "dn.upcoming": { zh: "当前场", en: "UPCOMING" },
  "dn.nextPreparing": {
    zh: "下一期筹备中 —— 想上台分享?去社区发帖打个招呼。",
    en: "The next night is in the works — want to present? Say hi in the community.",
  },
  "dn.archive": { zh: "往期归档", en: "ARCHIVE" },
  "dn.archiveEmpty": {
    zh: "还没有往期场次。第一期正在筹备。",
    en: "No past nights yet. The first one is in the works.",
  },
  "dn.rsvp": { zh: "报名到场", en: "RSVP — I'll be there" },
  "dn.rsvped": { zh: "已报名", en: "You're in" },
  "dn.cancelRsvp": { zh: "取消报名", en: "Cancel RSVP" },
  "dn.rsvpNotice": {
    zh: "报名即公开:你的 handle 会出现在到场名单中。",
    en: "RSVP is public: your handle appears on the attendee list.",
  },
  "dn.loginToRsvp": { zh: "登录后报名到场:", en: "Log in to RSVP:" },
  "dn.roster": { zh: "到场名单", en: "ATTENDEES" },
  "dn.rosterEmpty": {
    zh: "还没有人报名 —— 第一个署名的位置还空着。",
    en: "No one yet — the first name on the list is still open.",
  },
  "dn.rosterCount": { zh: "{n} 人已报名", en: "{n} in" },
  "dn.archiveCount": { zh: "{n} 人到场", en: "{n} attended" },
  "dn.rosterToggle": { zh: "到场名单({n})", en: "Attendees ({n})" },
  "dn.watchReplay": { zh: "观看回放", en: "Watch replay" },
  "dn.widgetTitle": { zh: "DEMO NIGHT", en: "DEMO NIGHT" },
  "dn.widgetRsvped": { zh: "已报名", en: "RSVP'd" },
  "dn.widgetCta": { zh: "查看与报名", en: "Details & RSVP" },
  "toast.rsvped": {
    zh: "已报名 —— 到场名单见",
    en: "You're on the list — see you there",
  },
  "toast.rsvpCancelled": { zh: "已取消报名", en: "RSVP cancelled" },
  /* ---- S3-1:文章引擎(/blog 月刊 + /learn 策划路径;独立分区,降低合并冲突面) ---- */
  "nav.blog": { zh: "月刊", en: "Letter" },
  "blog.title": { zh: "给 Kimi 官方的一封信", en: "A Letter to Team Kimi" },
  "blog.sub": {
    zh: "月刊 · 编辑署名定夺,不是算法",
    en: "Monthly · signed by named editors, not an algorithm",
  },
  "blog.empty": {
    zh: "创刊号筹备中 —— 编辑部正在汇总社区数据观察、用户痛点与精选作品,写好会署名发出,不拿空壳硬撑。",
    en: "Issue one is in the works — the editors are gathering community data, user pain points and featured builds, and will sign it when it ships. No empty shell in the meantime.",
  },
  "blog.new": { zh: "写新一篇", en: "New entry" },
  "learn.intro": {
    zh: "策划制学习路径:编辑部拍板的入门长文,按编号顺序读。不做 wiki。",
    en: "A curated learning path: long-form guides chosen by the editors, read in numbered order. Not a wiki.",
  },
  "learn.empty": {
    zh: "编辑部撰稿中 —— 第一批入门长文正在写,完成后会按顺序排在这里。",
    en: "The editors are writing — the first guides will line up here in order once ready.",
  },
  "art.langZh": { zh: "中文", en: "中文" },
  "art.langEn": { zh: "EN", en: "EN" },
  "art.draft": { zh: "草稿", en: "DRAFT" },
  "artf.newTitle": { zh: "新建文章", en: "New article" },
  "artf.editTitle": { zh: "编辑文章", en: "Edit article" },
  "artf.slug": {
    zh: "Slug(小写字母/数字/连字符)",
    en: "Slug (lowercase letters, digits, hyphens)",
  },
  "artf.kind": { zh: "类型", en: "Kind" },
  "artf.kindLetter": { zh: "月刊(letter)", en: "Letter (monthly)" },
  "artf.kindGuide": { zh: "学习路径(guide)", en: "Guide (learn path)" },
  "artf.locale": { zh: "语言", en: "Language" },
  "artf.title": { zh: "标题(200 字以内)", en: "Title (200 chars max)" },
  "artf.summary": {
    zh: "摘要(列表展示,500 字以内)",
    en: "Summary (shown in lists, 500 chars max)",
  },
  "artf.sortOrder": {
    zh: "路径顺序(仅 guide,小的在前)",
    en: "Order (guides only, smaller first)",
  },
  "artf.publish": {
    zh: "发布(不勾 = 存草稿,前台不显示)",
    en: "Publish (unchecked = draft, hidden from lists)",
  },
  "artf.deleteConfirm": {
    zh: "确定删除这篇文章?删除后不可恢复。",
    en: "Delete this article? This cannot be undone.",
  },
  "err.artSlug": {
    zh: "slug 只能用小写字母、数字、连字符(160 字以内)",
    en: "Slug: lowercase letters, digits and hyphens only (160 max)",
  },
  "err.artSlugTaken": {
    zh: "同语言下这个 slug 已被占用",
    en: "That slug is taken for this language",
  },
  "err.artTitle": {
    zh: "标题必填(200 字以内)",
    en: "Title required (200 chars max)",
  },
  "err.artSummaryLong": {
    zh: "摘要太长了(500 字以内)",
    en: "Summary too long (500 chars max)",
  },
  "err.artBody": { zh: "正文不能为空", en: "Body cannot be empty" },
  "err.artMeta": { zh: "类型或语言不合法", en: "Invalid kind or language" },
  /* ---- S2-3:个人主页年度构建足迹(独立分区,降低合并冲突面) ---- */
  "prof.footprint": { zh: "构建足迹", en: "BUILD FOOTPRINT" },
  "prof.privacy": { zh: "隐私与公开", en: "PRIVACY & VISIBILITY" },
  "prof.privacySelf": { zh: "仅自己可见;保存后全站生效", en: "Only you see this; applies site-wide" },
  "prof.footprintHint": {
    zh: "最近 12 个月 · 每日 token 总量",
    en: "Last 12 months · daily token totals",
  },
  /* ---- 个人主页 Kimi Design 改造(hero 统计带 / 足迹汇总 / 空态 / 右栏) ---- */
  "prof.share": { zh: "分享主页", en: "Share profile" },
  "prof.poster": { zh: "生成海报", en: "Poster" },
  "prof.profileUrl": { zh: "主页链接", en: "Profile URL" },
  "prof.statTotal": { zh: "累计 TOKEN", en: "LIFETIME TOKENS" },
  "prof.statTotalSub": { zh: "API 等价估算 {v}", en: "API-equivalent est. {v}" },
  "prof.statActiveDays": { zh: "活跃天数", en: "ACTIVE DAYS" },
  "prof.statActiveDaysSub": { zh: "近 12 个月", en: "last 12 months" },
  "prof.statStreak": { zh: "连续构建", en: "DAY STREAK" },
  "prof.statStreakSub": { zh: "周连续 {n} 周", en: "{n}-week streak" },
  "prof.statHitRate": { zh: "缓存命中率", en: "CACHE HIT" },
  "prof.statHitRateSub": { zh: "全部历史 · 缓存读 {v}", en: "all-time · cache read {v}" },
  "prof.statRequests": { zh: "累计请求", en: "REQUESTS" },
  "prof.statRequestsSub": { zh: "{n} 个会话", en: "{n} sessions" },
  "prof.fpYear": { zh: "近一年", en: "Last year" },
  "prof.fpActive": { zh: "活跃", en: "Active" },
  "prof.fpActiveUnit": { zh: "天", en: "days" },
  "prof.fpPeak": { zh: "单日峰值", en: "Peak day" },
  "prof.fpStreak": { zh: "当前连续", en: "Streak" },
  "prof.emptyPostsTitle": { zh: "还没有帖子", en: "No posts yet" },
  "prof.emptyPostsText": {
    zh: "把最近的构建心得、踩坑记录或作品进展写下来,社区成员都在等第一帖。",
    en: "Share your build notes, pitfalls, or work in progress — the community is waiting.",
  },
  "prof.emptyPostsCta": { zh: "发第一帖", en: "New post" },
  "prof.emptyCommentsTitle": { zh: "还没有评论", en: "No comments yet" },
  "prof.emptyCommentsText": {
    zh: "去社区逛逛,给同好的帖子留个言——好的讨论从第一条回复开始。",
    en: "Browse the community and leave a reply — good threads start with the first comment.",
  },
  "prof.emptyCommentsCta": { zh: "浏览社区", en: "Browse community" },
  "prof.emptyWorksTitle": { zh: "还没有上架作品", en: "No works yet" },
  "prof.emptyWorksText": {
    zh: "把你用 AI 构建的项目挑一个展示到作品页。",
    en: "Pick something you built with AI and show it on the works wall.",
  },
  "prof.emptyWorksCta": { zh: "上架作品", en: "Submit work" },
  "prof.usage30": { zh: "近 30 天 TOKEN", en: "30D TOKENS" },
  "prof.dailyTrend": { zh: "每日趋势", en: "Daily trend" },
  "prof.usageHit": { zh: "缓存命中率", en: "CACHE HIT" },
  "prof.usageActive": { zh: "活跃时长", en: "ACTIVE TIME" },
  "prof.usageNote": {
    zh: "近 30 天每日 Token · 与用量中心同步",
    en: "Daily tokens for the last 30 days · in sync with the usage center",
  },
  "prof.usageGo": { zh: "打开用量中心 →", en: "Open usage center →" },
  "prof.makerTokens": { zh: "累计 TOKENS", en: "LIFETIME TOKENS" },
  "prof.qrHint": {
    zh: "公开身份快照 · 扫码访问;不含项目名、设备与对话内容",
    en: "Public profile snapshot · scan to visit; no projects, devices, or conversations",
  },
  "prof.makerCta": { zh: "生成分享海报", en: "Create share poster" },
  "prof.tools": { zh: "常用工具", en: "Top tools" },
  "prof.toolsNote": { zh: "全部历史 · 按 Token", en: "all-time · by tokens" },
  "prof.toolsEmpty": { zh: "还没有用量数据。", en: "No usage data yet." },
  "prof.prefs": { zh: "构建偏好", en: "Build preferences" },
  "prof.prefPeak": { zh: "最活跃时段", en: "Busiest slot" },
  "prof.prefModel": { zh: "主力模型", en: "Top model" },
  "prof.prefDevice": { zh: "主设备", en: "Main device" },
  "prof.prefProject": { zh: "最常用项目", en: "Top project" },
  /* ---- P1-2:作品详情 + 互动(支持/评论;独立分区,降低合并冲突面) ---- */
  "works.tryIt": { zh: "体验作品", en: "Try it" },
  "works.support": { zh: "支持", en: "Support" },
  "works.supported": { zh: "已支持", en: "Supported" },
  "works.loginToSupport": {
    zh: "登录后支持这个作品",
    en: "Log in to support this work",
  },
  "works.discuss": {
    zh: "与作者聊聊这个作品",
    en: "Chat with the author about this work",
  },
  "works.noComments": {
    zh: "还没有评论 —— 来问作者第一个问题。",
    en: "No comments yet — ask the author the first question.",
  },
  "works.authorChip": { zh: "作者", en: "AUTHOR" },
  "works.notFound": {
    zh: "这个作品不存在,或已被作者撤下。",
    en: "This work doesn't exist, or the author took it down.",
  },
  "works.backToWorks": { zh: "返回作品墙", en: "Back to works" },
  "works.sideAuthor": { zh: "作者", en: "AUTHOR" },
  "works.sideLinks": { zh: "链接", en: "LINKS" },
  "works.sideInfo": { zh: "信息", en: "INFO" },
  "works.published": { zh: "发布时间", en: "Published" },
  /* ---- 作品用量声明制(20260822_work_claims;独立分区,降低合并冲突面) ---- */
  "works.claim": {
    zh: "构建投入声明(可选)",
    en: "Claimed build effort (optional)",
  },
  "works.claimPh": { zh: "如 612M、1.2B", en: "e.g. 612M, 1.2B" },
  "works.claimHint": {
    zh: "由你声明,系统按你的可验证用量总量封顶;留空 = 不展示徽章。仅自己的作品可声明(推荐站外项目不适用)。",
    en: "Declared by you and capped by your verifiable usage total; leave empty for no badge. Only your own works can carry a claim (not external recommendations).",
  },
  "works.claimRemaining": {
    zh: "剩余可声明额度 {n} tokens",
    en: "Remaining claimable: {n} tokens",
  },
  "works.claimSuggest": {
    zh: "按项目「{label}」的用量数据,建议 {n}",
    en: "Suggested from your project “{label}”: {n}",
  },
  "works.claimNoUsage": {
    zh: "想戴徽章,先接数据 —— 同步用量后才能声明构建投入。",
    en: "To wear a badge, connect your data first — sync usage before declaring build effort.",
  },
  "works.claimNoUsageCta": { zh: "去用量中心同步", en: "Go to Usage sync" },
  "works.claimPaused": {
    zh: "声明总额超出可验证总量,徽章已暂停展示,请重新分配。",
    en: "Your claimed total exceeds the verifiable total — badges are paused; please reallocate.",
  },
  "err.workClaimInvalid": {
    zh: "声明数字无法识别(支持如 612M 的紧凑写法)",
    en: "Unrecognized claim number (compact forms like 612M are fine)",
  },
  "err.workClaimExceeds": {
    zh: "超出剩余可声明额度(剩余 {n} tokens)",
    en: "Exceeds your remaining claimable allowance ({n} tokens left)",
  },
  /* ---- 壳层改版:固定顶栏 + 右栏上下文化(2026-08-10;独立分区,降低合并冲突面) ---- */
  "topbar.notif": { zh: "消息通知", en: "Notifications" },
  "rail.postMeta": { zh: "帖子信息", en: "POST INFO" },
  "rail.board": { zh: "板块", en: "Board" },
  "rail.relatedPosts": { zh: "相关帖子", en: "RELATED POSTS" },
  "rail.relatedPostsEmpty": {
    zh: "这个板块还没有其他帖子。",
    en: "Nothing else in this board yet.",
  },
  "rail.workMeta": { zh: "作品信息", en: "WORK INFO" },
  "rail.worksAbout": { zh: "作品墙", en: "THE GALLERY" },
  "rail.worksAboutBody": {
    zh: "社区成员用 Kimi 构建的真实作品。构建投入徽章为作者声明制:作者自报、系统按可验证总量封顶。",
    en: "Real projects members built with Kimi. Token badges are author-claimed, capped by verifiable totals.",
  },
  "rail.worksSubmit": { zh: "提交作品", en: "Submit your work" },
  "rail.worksTop": { zh: "热门作品", en: "TOP WORKS" },
  "rail.worksTopEmpty": { zh: "还没有作品,来提交第一个。", en: "No works yet — submit the first." },
  "rail.relatedWorks": { zh: "相关作品", en: "RELATED WORKS" },
  "rail.relatedWorksEmpty": {
    zh: "还没有同作者或同 Agent 的其他作品。",
    en: "No other works by this author or agent yet.",
  },
  "rail.aiSummon": { zh: "召唤 Kimi 分析", en: "SUMMON KIMI" },
  "rail.aiSummonHint": {
    zh: "让 Kimi 读一遍这个帖子,给出结构化分析。",
    en: "Ask Kimi to read this thread and give a structured analysis.",
  },
  "rail.awesomeAbout": { zh: "收录说明", en: "ABOUT THE LIST" },
  "rail.awesomeStats": { zh: "来源统计", en: "SOURCES" },
  "rail.sourceSite": { zh: "站内作品", en: "member works" },
  "rail.sourceAwesome": { zh: "站外收录", en: "external picks" },
  "rail.blogArchive": { zh: "期号归档", en: "ARCHIVE" },
  "rail.blogEditors": { zh: "编辑部", en: "EDITORS" },
  "rail.blogSubscribe": { zh: "订阅说明", en: "FOLLOW THE LETTER" },
  "rail.blogSubscribeBody": {
    zh: "新期发布会在社区同步开帖,跟紧社区即可第一时间读到。",
    en: "New issues are announced in the community — follow along there to catch each one.",
  },
  "rail.learnPath": { zh: "学习路径", en: "LEARNING PATH" },
  "rail.learnBody": {
    zh: "策划制长文路径:按编号顺序读,每篇解决一个上手阶段的问题,不追热点。",
    en: "A curated path of long-form guides — read in numbered order; each one covers one onboarding stage. No hot takes.",
  },
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
