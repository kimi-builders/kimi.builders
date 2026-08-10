# 数据库迁移体系

## 组成

- `db/schema.sql` — 当前终态 schema(全新环境装一次即可),全部 `CREATE TABLE IF NOT EXISTS`。
- `db/migrations/*.sql` — 增量迁移,按文件名(日期前缀)顺序执行。
- `scripts/db-migrate.mjs` — 迁移 runner(零依赖),用 `_migrations` 账本保证 exactly-once。
- `.github/workflows/db-validate.yml` — PR/push 自动验证(见下)。
- `.github/workflows/db-migrate-prod.yml` — 生产迁移(手动触发 + 审批)。

## 常用命令

```bash
# 本地 / 任意环境(库名带 kbu-mysql 才能跑集成测试)
export DATABASE_URL='mysql://root@127.0.0.1:3306/kbu-mysql'

node scripts/db-migrate.mjs status      # 已应用 / 待应用 / drift
node scripts/db-migrate.mjs migrate     # 应用全部待执行迁移(默认命令)

# 全新环境装库
mysql -h127.0.0.1 -uroot kbu-mysql < db/schema.sql
node scripts/db-migrate.mjs init-ledger # 把 schema.sql 已覆盖的迁移记账(legacy)
```

`_migrations` 账本:`name` 主键 + `checksum`(应用时文件 sha256;`legacy` = 初始化回填,
不参与 drift 检查)+ `applied_at`。账本一旦记录,同库不会再跑同一文件——
一次性 ALTER 也天然幂等。

## 写迁移的规则

1. **加列/加表优先**:新列必须有默认值或允许 NULL;旧代码在迁移与部署的窗口期必须兼容。
2. **种子数据**:用 `INSERT … WHERE NOT EXISTS(version)` 之类写法保持自身幂等。
3. **已应用的迁移文件不许再改**—— runner 会报 checksum drift;要修正就写新的矫正迁移。
4. 顺序即文件名顺序,命名 `YYYYMMDD_<topic>.sql`;同一天多个文件加字母/后缀区分。
5. DDL 在 MySQL 自动提交:单文件中途失败会部分落库,ledger 不记账,修好再跑。

## CI / 生产流程

- **db-validate**(PR/push 到 main,`db/**` 变更时):
  - `fresh-install`:空库 → `schema.sql` → `init-ledger` → `npm test` + `test:usage-db`
    (库名 `kbu-mysql` 正好满足集成测试守卫);
  - `upgrade-path`:取 base 分支(或 HEAD~1)的 `schema.sql` 建库 → 按 base 的文件清单记账 →
    `migrate` 只应用本变更新增的迁移 → `status` 必须零 pending。
- **db-migrate-prod**:Actions 页面手动 Run,绑 `production` environment。
  需要先在仓库 Settings → Environments 建 `production` 并配置 required reviewers,
  Secrets 配置 `PROD_DATABASE_URL`。
- 一次性数据修复(UPDATE/DELETE 类运维)不进迁移体系,逐条人工执行并记录。
