# Style unification design QA

Date: 2026-08-11

Branch: `feat/style-unification`

Scope contract: `docs/style-unification-brief.md` §8

## Visual sources

- Product gold standard: `/u/kimi` — `/tmp/style-gold-profile-light-en.png`
- Product gold standard: `/usage` — `/tmp/style-gold-usage-light-en-viewport.png`
- Community interaction reference: Skool Software Developer Academy — `/tmp/style-source-skool.png`
- Community interaction reference: VibeCafé latest feed — `/tmp/style-source-vibecafe.png`
- Same-input comparison sheet: `/tmp/style-reference-comparison-light.png`

The Skool and VibeCafé sources were inspected before implementation in the in-app browser. The interaction patterns carried into the implementation are compact feed cards, inline composition, post detail context, nested reply affordances, explicit expansion for additional replies, and useful empty/loading/error states.

## Implementation captures

- Community, dark desktop: `/tmp/style-impl-community-dark.png`
- Community, light English desktop: `/tmp/style-impl-community-light-en.png`
- Community, light English mobile (final): `/tmp/style-impl-community-mobile-final.png`
- Works wall, dark desktop: `/tmp/style-impl-works-dark.png`
- Work detail with failed-image fallback: `/tmp/style-impl-work-detail-dark.png`
- Works wall, light English mobile: `/tmp/style-impl-works-mobile.png`
- Login, light English desktop: `/tmp/style-impl-login-light-en.png`

## Matrix

| State | Desktop 1440×1000 | Mobile 390×844 | Result |
| --- | --- | --- | --- |
| Dark + Chinese | Community detail, reply folding, works wall/detail | Community feed/detail | Pass |
| Light + English | Community, usage, login, settings, learn, blog, Demo Night, Awesome, 404 | Community, works, navigation drawer, bottom tabs | Pass |
| Authenticated | Post draft restore, publish, comments/replies, work submit, notifications, settings | Navigation and core tabs | Pass |
| Signed out | Login and provider/email choices | Public browsing shell | Pass |

## Interaction checks

- Community draft persists locally, restores after refresh, can be cleared, and is removed after a successful submit.
- Post publish, root comment, nested replies, reply context, and “show more replies” work against the isolated QA database.
- Work submit succeeds; invalid cover URLs render the Lucide fallback rather than a broken image or fabricated asset.
- Global search opens from the header, filters bilingual destinations, closes correctly, and exposes the `/` and `⌘K` shortcuts.
- Theme and locale switches persist without hydration mismatch.
- Desktop rail controls, mobile drawer, mobile bottom navigation, segmented filters, notifications, login, settings tabs, 404, loading, and error states are reachable and functional.
- No visible placeholder controls or inactive “coming soon” actions remain in the scoped experience.

## Findings and resolution

- P2: the community topic row exposed a native horizontal scrollbar. Fixed with a touch-scrollable, visually hidden scrollbar utility.
- P2: a works statistic used an emoji glyph. Replaced with plain localized copy; icons remain Lucide or source assets.
- P2: the community draft restore effect was timing-sensitive during hydration. Deferred storage restoration until the client frame and added an explicit saved-state indicator.
- P2: poll submission omitted the post id. Added the required hidden form field.
- P0/P1/P2 remaining: none.

## Quality gates

- `npx tsc --noEmit`: pass
- `npm run lint`: pass
- `npm test`: pass — 259/259
- `npm run build`: pass — Next.js 16.3.0 production build in an isolated temporary copy
- Static token/emoji/fake-door audit: pass for the §8 scope; only global design tokens, email-template colors, source assets, and the protected gold-standard usage styles retain direct color literals.

The production build and write-path QA were isolated from the owner process on port 3000. Test writes used only `mysql://root@127.0.0.1:3306/kbu-mysql` through the QA server on port 3112.
