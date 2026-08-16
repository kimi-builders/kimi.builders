# Security Policy / 安全政策

## 报告漏洞

如果你发现 kimi.builders 站点的安全漏洞(鉴权绕过、注入、XSS、数据泄露等),
请**不要**开公开 Issue,发邮件到:

**we@kimi.builders**

请附上:受影响的功能/路径、复现步骤、可能造成的影响。POC 请克制,
不要访问或导出他人数据,不要进行破坏性测试。

- 我们会在 72 小时内回复确认;
- 修复并验证后,会在提交信息或 Release 中致谢(除非你希望匿名)。

## 范围说明

- 仓库内代码、表结构、部署脚本均为**有意公开**,不属于泄露;
- 环境变量、密钥、用户数据不在仓库中——如果你在任何公开渠道
  (含 git 历史)发现疑似真实凭证,请立即邮件告知,我们会优先处理并轮换。

## Supported Versions

仅最新部署版本(main 分支)受支持,没有旧版本维护线。

---

If you find a security vulnerability, please email **we@kimi.builders**
instead of opening a public issue. We aim to acknowledge within 72 hours.
Only the latest deployed revision (main) is supported.
