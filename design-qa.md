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
- `npm test`: pass — 261/261
- `npm run build`: pass — Next.js 16.3.0 production build in an isolated temporary copy
- Static token/emoji/fake-door audit: pass for the §8 scope; only global design tokens, email-template colors, source assets, and the protected gold-standard usage styles retain direct color literals.

The production build and write-path QA were isolated from the owner process on port 3000. Test writes used only `mysql://root@127.0.0.1:3306/kbu-mysql` through the QA server on port 3112.

## Checkbox visual unification follow-up

### Comparison target and evidence

- Source visual truth: `/var/folders/gn/89m8bgj965dbqqvjdb5lw3080000gn/T/codex-clipboard-658eee17-aecb-4e58-a74c-c2744663bd18.png`
- Browser-rendered implementation, dark full view: `/tmp/checkbox-qa-final-dark.png`
- Browser-rendered implementation, light full view: `/tmp/checkbox-qa-light.png`
- Same-input focused comparison: `/tmp/checkbox-comparison.png`
- Source pixels: 1488×1204. The checkbox region is a 2× capture and was downsampled by 50% for the focused comparison.
- Implementation pixels: 1265×840 full-page capture; focused form crop 274×190. Browser CSS viewport: 1280×720; device pixel ratio: 2.
- State: Chinese, desktop, filter popup open, checked and unchecked controls visible; dark and light themes captured. The dark focused comparison normalizes the source checkbox to the implementation's 16px CSS size.

### Full-view comparison

The implementation capture renders the production filter component and the shared post-form checkbox side by side. Both now use the same 16px control, 5px corner radius, 1.5px token border, blue checked fill, white Lucide check, and blue keyboard focus outline. The filter panel retains its existing density, row height, icons, labels, and footer actions; only the native square control changed.

### Focused comparison

`/tmp/checkbox-comparison.png` places the normalized source post-form controls and the browser-rendered shared controls in one image. Checked fill, checkmark weight, unchecked border, radius, baseline, and text gap are visually aligned. No actionable P0/P1/P2 mismatch remains.

### Comparison history

- Initial P2: usage, works, and Awesome filters used browser-native square checkboxes that drifted by platform and did not match the post form.
- Fix: introduced `components/CheckboxControl.tsx`, moved the post form onto it, and reused it across usage filters, records columns, works/Awesome filters, device approval, and article publishing. The native input remains the semantic control, with a visible custom layer and a forced-colors fallback.
- Post-fix evidence: `/tmp/checkbox-qa-final-dark.png`, `/tmp/checkbox-qa-light.png`, and `/tmp/checkbox-comparison.png`.

### Interaction and runtime checks

- Visible checkbox rows toggle between checked and unchecked states and expose the native `checkbox` role.
- Focus is retained on the native input and the visible control exposes a high-contrast blue focus outline.
- Existing filter draft/apply, outside-click, and Escape logic was not altered; all consumers still receive their original `checked`, `defaultChecked`, `name`, `value`, and `onChange` props.
- Browser console: no errors or warnings; development informational log only.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npm test`: pass — 259/259.
- `npm run build`: pass — isolated Next.js 16.3.0 production build.

### Findings

- P0/P1/P2 remaining: none.
- P3 follow-up: none; the blue focus ring is intentionally stronger than the resting source state for keyboard accessibility.

final result: passed

## Avatar, profile identity, and leaderboard navigation follow-up

### Source visual truth and implementation evidence

- User-reported leaderboard state: `/var/folders/gn/89m8bgj965dbqqvjdb5lw3080000gn/T/codex-clipboard-84a18663-0f51-4be1-b479-bc2107db0b46.png` (1920×767).
- User-reported profile state: `/var/folders/gn/89m8bgj965dbqqvjdb5lw3080000gn/T/codex-clipboard-7205ab25-5cfe-4020-b112-a79440e0e194.png` (1365×452).
- YouTube channel hierarchy reference: `/var/folders/gn/89m8bgj965dbqqvjdb5lw3080000gn/T/codex-clipboard-4bd0c5c4-c0ef-46e3-b5bf-f0e507d84b67.png` (1365×413).
- Final profile implementation: `/tmp/avatar-profile-final-dark.png` (1265×720 viewport capture) and `/tmp/avatar-profile-v1-light.png` (1265×720 viewport capture).
- Final leaderboard implementation: `/tmp/avatar-ranking-autoscroll-v2.png` (1265×878 viewport capture).
- Full profile hierarchy comparison, reference above and implementation below: `/tmp/avatar-profile-youtube-comparison-final.jpg` (950×666).
- Focused before/after profile comparison: `/tmp/avatar-profile-before-after-final.jpg` (950×666).
- Focused before/after leaderboard comparison: `/tmp/avatar-ranking-before-after.jpg` (950×760).
- CSS viewport: 1280×720 for the profile and 1287×878 for the leaderboard, device pixel ratio 2. Browser screenshots are CSS-pixel normalized. Focused comparisons normalize both regions to the same 950px-wide canvas before judging.
- State: authenticated as `@kimi`, Chinese, desktop, dark primary state; profile also checked in light mode.

### Comparison history

- Initial P1: the selected model could remain clipped at the right edge after URL navigation. Fixed with a small client navigation wrapper that tracks the active key and scrolls the selected chip as close to center as available content permits. Direct URL restoration and an in-page model change both move the active chip into the visible region.
- Initial P2: leaderboard ranks used filled circular badges that added unnecessary visual weight. Replaced with plain tabular mono numbers; first place keeps only blue text emphasis.
- Post-fix P2: reducing the rank track made the Chinese `名次` header wrap. Restored the 48/56px responsive track while keeping the rank unframed. Post-fix evidence: `/tmp/avatar-ranking-autoscroll-v2.png` and `/tmp/avatar-ranking-before-after.jpg`.
- Initial P1: the profile avatar used a blue ring/glow and identity statistics/actions were detached below the avatar. Removed the wrapper effect and reorganized the profile header in the YouTube reference order: avatar, display name, handle/social counts, joined/link metadata, bio, then actions.
- Initial P2: the shared avatar component and two hover consumers could reintroduce borders. Removed borders at the shared component source, retained circular cropping and `object-cover`, and changed hover feedback to opacity while preserving keyboard-only focus outlines on links.

### Required fidelity surfaces

- Typography: the existing site font stack remains intact; the profile display name now carries the primary 22/26px weight while handle, social counts, and metadata use compact mono tiers like the channel reference.
- Spacing and layout: identity content is grouped beside a 96px borderless avatar on desktop and a 72px avatar below `sm`; actions now follow the bio inside that content column. The existing usage metric strip stays separate and factual.
- Colors and tokens: only current `paper`, `grey`, `blue`, `line`, `moon`, and `usage-hero` tokens are used. Blue remains a link/primary-action/first-rank accent instead of an avatar decoration.
- Image quality and assets: real avatar images keep circular `object-cover`; missing avatars use the existing initial fallback without fabricated imagery. The YouTube banner was treated as a hierarchy reference, not copied because kimi.builders has no cover-image product field.
- Copy and content: all existing profile facts, bilingual labels, actions, privacy language, and leaderboard values are preserved.

### Interaction, accessibility, and responsive checks

- `claude-sonnet-5` restores from the URL with the selected chip fully visible; measured chip bounds are inside the horizontal navigation bounds with `scrollLeft = 467.5`.
- A model link navigation updates the URL and runs the same active-key positioning logic; reduced-motion users receive an immediate rather than animated scroll.
- Leaderboard and profile report zero desktop horizontal overflow. The profile avatar computes to `border-top-width: 0px` and `box-shadow: none`.
- Avatar links keep visible keyboard focus outlines even though resting and hover borders are removed.
- Profile and leaderboard browser logs contain 0 errors and 0 warnings.
- The shared avatar change covers every `Avatar` consumer; a static audit found no remaining avatar-specific ring, shadow, or border wrapper.

### Final gates

- React best-practices review: pass — minimal client boundary, primitive effect dependency, no data-fetching or hydration regression.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npm test`: pass — 261/261.
- `npm run build -- --webpack`: pass — isolated Next.js 16.3.0 production build, 42 static pages generated.
- `git diff --check`: pass.

### Findings

- P0/P1/P2 remaining: none.
- P3 follow-up: none required for this request.

final result: passed

## Works icon and profile heatmap follow-up

### Comparison target and evidence

- Source visual truth: `/var/folders/gn/89m8bgj965dbqqvjdb5lw3080000gn/T/codex-clipboard-777ce0db-9315-4364-b150-ac07faceb22b.png`
- Browser-rendered profile implementation, dark desktop: `/tmp/profile-usage-layout-dark.png`
- Browser-rendered profile implementation, light desktop: `/tmp/profile-usage-layout-v1.png`
- Browser-rendered works icon, dark desktop: `/tmp/works-icon-qa-dark.png`
- Browser-rendered works icon, light desktop: `/tmp/works-icon-qa.png`
- Same-input focused comparison: `/tmp/profile-layout-comparison.png`
- Source pixels: 2734×1686. Focused source crop: 1550×660, normalized to 1280×545 for the comparison sheet.
- Implementation pixels and CSS viewport: 1280×720. Browser device pixel ratio: 2; the in-app browser returned CSS-pixel-normalized 1280×720 captures.
- State: `/u/kimi?tab=usage`, Chinese, desktop, activity heatmap visible; both dark and light themes. `/works` was captured separately for the new navigation and empty-state icon.

### Full-view comparison

The annotated source used one-character weekday labels, left the right side of the 7×24 grid empty, and placed a collapsed busiest-slots disclosure below the chart. The implementation spells out `周一` through `周日`, preserves the 24 readable hourly columns, and uses the former right-side whitespace for a persistent ranked TOP 5 summary. The chart remains single-column on smaller breakpoints and becomes horizontally scrollable only where needed to protect cell legibility.

### Focused comparison

`/tmp/profile-layout-comparison.png` places the annotated source region and the browser-rendered dark implementation in one input. The weekday hierarchy, heatmap density, grid alignment, right-column occupation, card boundary, and TOP 5 scan order are directly visible. `/tmp/works-icon-qa-dark.png` confirms that the old rocket metaphor is replaced by Lucide `GalleryVerticalEnd` in the left navigation, works heading, and empty state; mobile drawer/tab reuse the same icon component.

### Required fidelity surfaces

- Fonts and typography: existing mono/UI font stack, weights, and sizes are preserved; weekday labels gain width without changing the heatmap's optical density.
- Spacing and layout: the heatmap and summary use a bounded two-column desktop grid; the summary aligns with the chart top and fills the annotated whitespace without increasing card width.
- Colors and tokens: all surfaces use the existing `paper`, `grey`, `blue`, `line`, and `moon` tokens in both themes.
- Image/icon quality: no raster imagery is involved. `GalleryVerticalEnd` is a standard Lucide vector icon that matches the project's icon family and communicates a gallery/portfolio rather than launch.
- Copy/content: Chinese weekdays are complete (`周一`–`周日`); English uses full weekday names. The existing TOP 5 values and timezone copy remain factual and unchanged.

### Comparison history and findings

- Initial P2: the rocket icon suggested launch rather than a gallery of finished work. Fixed by applying `GalleryVerticalEnd` consistently across desktop navigation, mobile navigation, the works page, work-detail empty state, and screenshot fallback.
- Initial P2: one-character weekday labels required decoding, while the right column was unused and busiest slots were hidden below a disclosure. Fixed with full weekday labels and a persistent ranked side card.
- Post-fix evidence: `/tmp/profile-usage-layout-dark.png`, `/tmp/profile-usage-layout-v1.png`, `/tmp/works-icon-qa-dark.png`, and `/tmp/profile-layout-comparison.png`.
- P0/P1/P2 remaining: none.

### Interaction and quality gates

- Heatmap cells retain native button semantics, accessible full weekday/hour labels, hover/focus tooltip behavior, and keyboard focus styling.
- TOP 5 is now immediately visible with no extra disclosure interaction.
- Browser console: no errors or warnings; development informational log only.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npm test`: pass — 259/259.
- `npm run build`: pass — isolated Next.js 16.3.0 production build.

final result: passed

## Community leaderboard unification follow-up

### Visual target and evidence

- Source leaderboard capture: `/tmp/community-ranking-audit-01-current-desktop.jpg`
- Product gold-standard capture: `/tmp/community-ranking-audit-03-profile-gold.jpg`
- Final implementation captures: `/tmp/community-ranking-final-dark-zh.jpg`, `/tmp/community-ranking-impl-05-overall-light-zh.jpg`, `/tmp/community-ranking-impl-02-agent-dark-en.jpg`, and `/tmp/community-ranking-impl-03-model-dark-en.jpg`
- Full three-state comparison (old leaderboard / profile gold standard / revised leaderboard): `/tmp/community-ranking-design-qa-comparison.jpg`
- Focused leaderboard comparison (old stack / revised single board): `/tmp/community-ranking-design-qa-focus.jpg`
- Browser CSS viewport: 1280×720, device pixel ratio 2. In-app browser full-page screenshots are CSS-pixel normalized: source 1265×895, profile reference 1265×957, final dark Chinese implementation 1265×837.
- Primary comparison state: authenticated as `@kimi`, dark Chinese, overall board, 7-day period. Additional dark English Agent/model states and light Chinese overall state were captured.

### Comparison history

- Initial P1: overall, Agent, and model rankings were three equally weighted hard-edged tables, making the page read like an admin report rather than the profile-led community product. Fixed by moving title/trust/period controls into a `usage-hero`, adding a profile-style personal metric strip, and consolidating the three data sets into one rounded primary ranking card.
- Initial P2: raw source/model identifiers (`claude-code`, `kimi-code`, `kimi-k3`) were visible controls. Fixed by reusing `usageSourceLabel`, `usageModelDisplayName`, `AgentIcon`, and `ModelIcon`; raw IDs remain only in stable URL query values and optional titles.
- Initial P2: repeated headers and share actions obscured hierarchy. Fixed with a single `overall / by Agent / by model` segmented control and one contextual share action.
- Initial P2: fixed tabular rows offered weak narrow-screen priority and no column semantics. Fixed with a semantic table, scoped column headers, a two-tier member cell below `sm`, hidden secondary desktop columns on small screens, and 44px mobile controls.
- Post-fix comparison evidence: `/tmp/community-ranking-design-qa-comparison.jpg` and `/tmp/community-ranking-design-qa-focus.jpg`.

### Required fidelity surfaces

- Typography: existing local JetBrains Mono/UI stack is unchanged; display hierarchy now follows the profile gold standard with a 21px title, 14px card heading, compact metric values, and mono metadata.
- Spacing and layout: 16px/20px card padding, 16px section gaps, `rounded-2xl` primary surfaces, hairline dividers, and one bounded wide canvas align with `/u/[handle]` and `/usage`.
- Colors and tokens: only existing `paper`, `grey`, `blue`, `line`, `card`, and `usage-hero` tokens are used. Blue is restricted to trust/status, active outlines, and first-place emphasis.
- Assets and icons: Lucide Trophy/ShieldCheck and existing LobeHub brand icons are reused; no emoji, placeholder, CSS-drawn, or fabricated visual assets were added.
- Copy and content: current bilingual strings and factual trust/scope/cost disclosures are preserved; duplicated trust copy was removed from the footer.

### Interaction and accessibility checks

- Authenticated `@kimi` state exposes the real “My rank” card with token, active-day, and cost ranks.
- Period, board type, Agent, and model selections navigate to restorable URL states; Kimi Code and Kimi K3 labels/icons were verified after navigation.
- The leaderboard now exposes native table/caption/column-header semantics, member profile links, `aria-current` selected states, keyboard focus outlines, and minimum 44px mobile segmented/chip targets.
- Dark Chinese, dark English, and light Chinese renders have zero desktop horizontal overflow; a fresh console check reports 0 errors and 0 warnings.
- The in-app browser viewport override did not change its fixed desktop canvas during this run. Narrow-screen behavior was therefore checked from the rendered responsive class rules rather than claimed as a separate browser screenshot; the table intentionally collapses secondary metrics into the member cell below `sm`.

### Findings

- P0/P1/P2 remaining: none.
- P3 remaining: none. The browser's fixed desktop canvas prevented a new exact 390px capture, so that environment limitation is recorded above rather than represented as a product defect.

### Final gates

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npm test`: pass — 261/261.
- `npm run build -- --webpack`: pass — isolated Next.js 16.3.0 production build, 42 static pages generated.
- `git diff --check`: pass.

final result: passed

## §8 completion audit

### Full visual matrix

- Evidence root: `/tmp/style-final-qa`
- Contact sheets: `/tmp/style-final-qa/contact-community.png`, `/tmp/style-final-qa/contact-works.png`, `/tmp/style-final-qa/contact-content.png`, and `/tmp/style-final-qa/contact-global.png`
- 68 route-state captures: dark Chinese desktop (1440×1000), dark Chinese mobile (390×844), light English desktop, and light English mobile.
- Authenticated routes: community feed/detail/new, works wall/detail/new, Awesome, Learn list/detail, Letter list/detail, Demo Night, notifications, settings, and 404.
- Signed-out routes: login and public community.
- Captures wait for real main content (`main.textContent.trim().length > 20`) before the final settle; loading skeletons are not accepted as final evidence.
- All 34 mobile captures report `document.documentElement.scrollWidth === clientWidth`; English captures report the expected `html[lang="en"]`.

### Final interaction pass

- Global search: header button and `/` both open the dialog; `Escape` closes it.
- Community: a typed draft reports saved, survives refresh, reports restored, and clears through the UI; one extra nested reply expands; reply context appears and cancels.
- Works: selecting `Kimi Agent` and applying produces `?agent=kimi-agent` plus the active filter chip.
- Awesome recommendation: at a 1024×650 viewport the intercepted `/works/new` dialog has a 495px viewport over 1686px of content, scrolls to 1191px, and returns to `/awesome` on `Escape`.
- Demo Night: RSVP cancellation and restoration both complete against the isolated local QA database.
- Mobile shell: the navigation drawer opens, moves to Works, closes after navigation, retains five bottom destinations, and has zero horizontal overflow.
- Settings tabs select correctly on a 390×844 viewport with zero horizontal overflow.
- A fresh production-browser session on `/awesome` reports 0 console errors and 0 warnings.

### Final gap resolution

- Primary blue actions across app error/404, desktop and mobile navigation, login, blog, community, works comments, polls, and Demo Night now use the brief's `shadow-blue/25` elevation instead of the weaker `/15` variant.
- The root `@modal` slot is required in the root layout signature, matching Next.js 16 generated `LayoutProps` and unblocking the production build.
- The explicit user follow-ups are present together: shared custom checkboxes, portfolio-oriented Works icon, full weekday labels with the busiest-time summary beside the heatmap, scroll-safe Awesome recommendation, consistent Kimi product marks, and work-only `Kimi Code` / `Kimi Swarm` / `Kimi Agent` attribution. Usage and leaderboard choices remain limited to measurable sources.
- The final post-audit refinement removes avatar decoration through the shared component, adopts the YouTube-style profile identity hierarchy, keeps leaderboard ranks unframed, and scrolls the active Agent/model chip fully into view.

### Final gates

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npm test`: pass — 261/261.
- `npm run build -- --webpack`: pass — isolated Next.js 16.3.0 production build, 42 static pages generated. The default Turbopack build cannot bind its internal PostCSS worker port in the Codex sandbox; the official Webpack build backend completes compilation, generated route typing, page-data collection, and static generation.
- `git diff --check`: pass.
- Static audits: no `shadow-blue/15` remains in `app` or `components`; no protected API/ops/dependency changes; no visible fake-door route or inactive soon control in scope.

final result: passed
