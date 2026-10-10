# Awesome publication operations

Production scheduling is not enabled by this implementation. The existing site
works and member `also_awesome` rules remain authoritative for member content.
Repository-managed external project fields come from the fixed community repository's
approved main. Unmapped historical recommendations retain their existing ownership;
they are not evidence of repository review.

## Collection scope

Awesome selects interesting, useful projects that meet real user needs. Projects may
be developed with any Agent and need a verifiable connection under at least one of
three alternative scopes:

- **Built on Kimi** (`base`): Kimi models or APIs power the project's core capability
  at runtime, regardless of the Agent used for development.
- **For Kimi ecosystem** (`eco`): tools, integrations, or resources explicitly serve
  Kimi users or its ecosystem; Kimi need not participate in development.
- **Kimi helped build** (`part`): Kimi actually participated in development; the
  finished project need not use Kimi at runtime.

Do not require all three scopes or make Kimi-assisted development a prerequisite for
`base` or `eco`. Reviewers choose the supported scope using first-party evidence and
record Agent participation accurately; runtime or ecosystem compatibility alone does
not establish which Agent developed a project. Use the content repository's
[contribution guide](https://github.com/kimi-builders/awesome-kimi-builders/blob/main/CONTRIBUTING.md)
and [entry schema](https://github.com/kimi-builders/awesome-kimi-builders/blob/main/data/README.md)
for the full criteria and field definitions.

This scope clarification changes neither the publication protocol nor ownership.
New external entries still require repository review; historical recommendations
remain distinguishable; member work appears only through its existing opt-in. It
also does not publish pending entries or establish missing evidence on their behalf.

## Before first activation

1. Independently accept the local report and tests. Review the four proposed
   published entries and 48 pending entries in the content repository. Commit and
   merge the protocol/verified subset to main only after separate authorization.
2. Review existing production works with a read-only query. Populate
   `ops/awesome-bindings.json` with `{entryId,workId,expectedUrl}` records and review
   them as deployment configuration. Match source URLs, never names. Local
   Cookbook IDs 10, 11 and 13 are ambiguous; they are not production bindings.
3. Deploy the site and additive migration through the normal approved pipeline.
   The immutable standalone release includes the mapping, runner and
   `AWESOME_SYNC_ENABLED` capability marker. The marker does not enable scheduling.
4. Reuse the controlled release's `CRON_SECRET` (at least 32 characters); no new
   credential is needed. Server DB access uses existing `DATABASE_URL`; only the
   existing works and new projection/run tables are written. Public GitHub needs
   no token; optional `AWESOME_GITHUB_READ_TOKEN` needs repository contents:read
   only. Never put secrets into the content repository or fork PR workflows.
5. Install the release's runner into `shared/awesome-cron.sh` with mode 755 after
   verifying the release manifest. `flock` must be available on the Linux host.
   It uses the same `shared/deploy-health.lock` as atomic deployment. Refresh this
   shared copy when upgrading the runner; its capability check defers legacy
   rollback releases with exit 75 and retains pending work. It reads credentials from the resolved current release.
6. Run `shared/awesome-cron.sh DEPLOY_ROOT APP_PORT dry-run`. The API returns
   per-entry create/update/bind/withdraw/conflict/unchanged actions and run ID.
   The runner logs only counts; inspect the authenticated JSON response or run
   table for the review detail. Resolve every conflict; the whole batch fails if
   any conflict remains. A dry-run writes audit records only.
7. Run the same command with `sync`. Verify counts, source commit, both locales,
   unchanged IDs/interactions, public lists, detail and rails. Repeat once to
   verify unchanged entries. Confirm the authenticated GET health response.
8. Only then adapt and install `ops/awesome-cron.example`: Monday 03:27 UTC sync,
   conditional retry every 15 minutes, and daily 03:37 UTC health check. No desktop agent or weekly rebuild is required.
   Existing `HEALTH_ALERT_WEBHOOK_URL` receives state transitions; logger and the
   shared log also record failures/recovery. The health API rejects failures,
   pending cache invalidation and over eight days without a successful sync.

## Manual run and failure handling

The manual runner and cron call the same POST `/api/cron/awesome-sync`. GET is an
authenticated health read, never a mutation. Unauthenticated calls return 401.
The API accepts only `dryRun` or a rollback run ID; it accepts no URLs, repository,
branch, SQL, snapshot or client binding map. Source reads resolve fixed main once
and then fetch one bounded catalog at that SHA. Timeouts, redirects, invalid JSON,
counts, hashes, unsupported protocols and any invalid entry reject the whole
snapshot. Missing/pending IDs never withdraw works.

The MySQL advisory lock rejects overlapping sync/rollback. Per-entry owned fields
are locked inside a batch transaction; audit success and writes commit together.
A manual owned-field override generates a conflict. Visibility, user/recommender,
creation time, moderation, votes, comments, featured selection and media are never
synchronized. Member bindings add provenance only and do not imply Awesome opt-in. Members retain their existing deletion action; source mappings retain a tombstone, and subsequent publication conflicts rather than recreating a deleted work. An explicit withdrawal resolves that tombstone.

Inspect `awesome_sync_runs` for status, `source_revision`, counts, safe error codes,
before/after images and `cache_pending`. Investigate failure; keep the last good
projection. Retry via the same runner. Cache invalidation uses Route Handler
`revalidateTag(tag,{expire:0})` and `revalidatePath` after commit, never
Server Action-only `updateTag` in a script. Failed cache steps are retried even if
the next snapshot is unchanged. Restrict the audit data to operators.

## Lock contention and bounded retries

The runner waits up to 90 seconds for its queue lock, then up to 90 seconds for
`shared/deploy-health.lock`. `AWESOME_LOCK_WAIT_SECONDS` may set each bound to
1–300 seconds. The existing minute health check still takes only the deployment
lock and may skip during publication; a short health check no longer drops the
weekly publication. Deployment and publication remain mutually exclusive.

Exit 0 means an executed request succeeded (or `retry` explicitly reports `idle`
with no pending request). Exit 75 means deferred/not executed or pending work;
exit 1 means failure. `sync` queues/re-arms publication; `retry` executes only a
pending request, up to 8 attempts including the initial attempt. Retries are
15 minutes apart, never a tight loop. Failed requests and interrupted runs retain
pending work. After exhaustion, investigate and run `sync` manually to re-arm.
A repeated request after an uncertain HTTP result relies on the server's digest
comparison and transaction journal; unchanged content is not republished.

State, attempt count and a pending alert are in `shared/health/awesome.*` with
private permissions. Lock timeouts immediately log to stderr/syslog and persist
`deferred`; they cannot safely read release credentials under the deployment
lock. The next retry or daily health check that acquires the lock delivers the
retained transition to the existing webhook, then reports recovery. The health
runner cannot report success while local pending/exhausted work remains, even
if the last server-side sync is still healthy. Monitor the shared log when a
long deployment prevents both retries and credential loading.

Ordinary edits preserve the database source: member work accepts `also_awesome`
but cannot turn into an external recommendation; unmapped historical external
recommendations remain editable by their original recommender, retaining source
and author/scope requirements. Once mapped as external, repository ownership
blocks ordinary editing. Public labels distinguish repository entries, legacy
recommendations and member work; validated catalog author URLs take precedence.
Queued AI replies check publication both before model invocation and inside the
final write transaction, so withdrawal cannot create a reply/count/notification.

## Rollback and disabling

Disable all three Awesome cron lines first. After waiting for any active runner
to finish, clear `shared/health/awesome.pending` and `awesome.active` under
`shared/awesome-job.lock` if deliberately cancelling queued publication. For data rollback use
`shared/awesome-cron.sh DEPLOY_ROOT APP_PORT rollback RUN_ID`. Owned fields/mappings
must still equal the original run's after-image; intervening changes generate
`rollback_conflict`. Only repository-owned fields/provenance are restored. Later
votes, comments, private/hidden state and feature choices survive. Newly imported
works are withdrawn, not deleted. Revalidate and verify the result. Do not resume
the schedule until main has the intended approved content, or it will reapply it.

Use the normal atomic release rollback for code. Retain the new additive tables
and run history; old releases ignore them. The retained shared runner reports a release without
`AWESOME_SYNC_ENABLED` as deferred (exit 75); it does not call a missing endpoint.
Pending work remains observable and consumes the bounded retry budget. Do not run destructive schema rollback.

## Local acceptance reproduction

Run both content generators/checks and the guarded `test:awesome-db` alongside all
existing DB suites. Apply dev/test migrations and compare a fresh schema with
historical migration replay using `scripts/db-compare-schemas.mjs`. The browser
acceptance uses isolated `kbu-mysql` data and a transport fixture for the fixed
GitHub endpoints because the catalog has not been committed/pushed to main. The
real sync Route Handler, SQL transaction, cache expiry and rendered pages execute;
the fixture does not prove production GitHub credentials or cron installation.
Do not label upstream documentation review as installation/runtime verification.
