# Security Policy / 安全政策

[English](#security-policy) · [中文](#安全政策)

---

## 安全政策

### 报告漏洞

如果你发现 kimi.builders 站点的安全漏洞(鉴权绕过、注入、XSS、数据泄露等),
请**不要**开公开 Issue,发邮件到:

**we@kimi.builders**

请附上:受影响的功能/路径、复现步骤、可能造成的影响。POC 请克制,
不要访问或导出他人数据,不要进行破坏性测试。

- 我们会在 72 小时内回复确认;
- 修复并验证后,会在提交信息或 Release 中致谢(除非你希望匿名)。

### 范围说明

- 仓库内代码、表结构、部署脚本均为**有意公开**,不属于泄露;
- 环境变量、密钥、用户数据不在仓库中——如果你在任何公开渠道
  (含 git 历史)发现疑似真实凭证,请立即邮件告知,我们会优先处理并轮换。

### 支持的版本

仅最新部署版本(main 分支)受支持,没有旧版本维护线。

---

## Security Policy

### Reporting a Vulnerability

If you discover a security vulnerability in kimi.builders (auth bypass, injection,
XSS, data exposure, etc.), please **do not** open a public issue — email:

**we@kimi.builders**

Please include: the affected feature/path, steps to reproduce, and the potential
impact. Keep any PoC minimal — do not access or export other people's data,
and do not run destructive tests.

- We will acknowledge your report within 72 hours;
- Once the fix is verified, we will credit you in the commit message or release
  notes (unless you prefer to stay anonymous).

### Scope

- The code, database schema, and deployment scripts in this repository are
  **intentionally public** and are not considered leaks;
- Environment variables, secrets, and user data are never committed — if you
  spot what looks like a real credential in any public channel (including git
  history), email us immediately and we will prioritize investigation and rotation.

### Supported Versions

Only the latest deployed revision (the `main` branch) is supported; there are no
maintained legacy release lines.
