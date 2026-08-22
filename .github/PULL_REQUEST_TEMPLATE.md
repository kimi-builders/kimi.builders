## Summary

<!-- What and why, one short paragraph. -->

## Checklist

- [ ] Gates pass locally: `npx tsc --noEmit && npm run lint && npm test && npm run build`
- [ ] Comments are English and follow [docs/comment-style.md](../docs/comment-style.md)
      (if this PR converts comments, `UPDATE_BASELINE=1 npm test` was run and
      `tests/comment-baseline.json` is included; converted files are `locked`)
- [ ] User-facing copy added to the i18n dictionary as zh/en pairs
- [ ] No new dependencies; no changes to applied `db/migrations/`
      (`db/schema.sql` updated if needed)
- [ ] New routes added to the `proxy.ts` matcher

<!-- Integration suites (`test:*-db`) if this PR touches DB code. -->
