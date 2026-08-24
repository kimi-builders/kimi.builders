/* Monthly section posters: two sections share one skin (identity band +
   QR footer + hard-edge hairlines) with different skeletons —
   02 fact sheet = hero big number + a two-column mono number grid
   (missing values show "—", never invented);
   03 editorial decisions = decision cards (kind chip + title + author +
   the editor's one-line reason + "— picked by @editor").
   (01 editorial review is long-form and never posterized; the retired
   "letter to the official" layer took its poster with it.)
   Fixed 1080x1440 (LETTER_POSTER_SIZE): content caps are pinned at
   assembly (<=3 decisions, 7 facts), the main area centers vertically —
   rich content fills, sparse content leaves symmetric whitespace (same
   idea as the post poster). Layer colors match the monthly page: mint
   for facts, amber for decisions. */
import type {
  LetterSection,
  LetterShareSnapshot,
} from "@/src/lib/share-letter";
import type { IssueDecisionKind, IssueFact } from "@/src/lib/monthly";
import {
  POSTER_FONT_FAMILY,
  POSTER_PADDING,
  PosterFooter,
  PosterHeader,
  palette,
} from "../../poster-kit";

const SECTION_META: Record<
  LetterSection,
  { no: string; zh: string; en: string; color: string; scanHint: string }
> = {
  facts: { no: "02", zh: "事实盘点", en: "FACTS", color: palette.green, scanHint: "扫码看本期事实盘点" },
  decisions: { no: "03", zh: "编辑定夺", en: "DECISIONS", color: palette.amber, scanHint: "扫码看本期编辑定夺" },
};

/* Decision chip colors match the blog detail page's decisionChip
   (build mint / discussion blue / ruling grey). */
const DECISION_CHIP_COLORS: Record<IssueDecisionKind, string> = {
  work: palette.green,
  post: palette.blue,
  governance: palette.muted,
};

function SectionTitle({ meta }: { meta: (typeof SECTION_META)[LetterSection] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", color: meta.color, fontSize: 24, letterSpacing: 6 }}>
        {meta.no} · {meta.en}
      </div>
      <div style={{ display: "flex", marginTop: 16, fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
        {meta.zh}
      </div>
    </div>
  );
}

/* 02: the first fact is the hero number, the rest a two-column grid;
   the blue left edge matches the blog detail page's fact cells. */
function FactsBody({ facts }: { facts: IssueFact[] }) {
  const [hero, ...rest] = facts;
  const rows: IssueFact[][] = [];
  for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));
  return (
    <div style={{ display: "flex", marginTop: 46, flexDirection: "column" }}>
      {hero ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderLeft: `3px solid ${palette.blue}`,
            paddingLeft: 28,
          }}
        >
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{hero.value}</div>
          <div style={{ display: "flex", marginTop: 18, color: palette.muted, fontSize: 22, letterSpacing: 1 }}>
            {hero.label}
          </div>
        </div>
      ) : null}
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", marginTop: 44 }}>
          {row.map((f) => (
            <div
              key={f.label}
              style={{
                display: "flex",
                flex: 1,
                minWidth: 0,
                flexDirection: "column",
                borderLeft: `2px solid ${palette.blue}`,
                paddingLeft: 22,
                marginRight: 40,
              }}
            >
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700, whiteSpace: "nowrap" }}>{f.value}</div>
              <div style={{ display: "flex", marginTop: 12, color: palette.muted, fontSize: 18 }}>{f.label}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* 03: decision cards; an empty field is still a record (same line as
   the blog detail page). */
function DecisionsBody({ snapshot }: { snapshot: LetterShareSnapshot }) {
  if (snapshot.decisions.length === 0) {
    return (
      <div style={{ display: "flex", marginTop: 46, color: palette.muted, fontSize: 24, lineHeight: 1.7 }}>
        本月没有新的精选——定夺栏留空也是记录。
      </div>
    );
  }
  return (
    <div style={{ display: "flex", marginTop: 42, flexDirection: "column" }}>
      {snapshot.decisions.map((d, i) => (
        <div
          key={`${d.kindLabel}-${d.title}`}
          style={{
            display: "flex",
            flexDirection: "column",
            borderTop: i ? `1px solid ${palette.grid}` : "none",
            paddingTop: i ? 26 : 0,
            marginTop: i ? 26 : 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                border: `1px solid ${DECISION_CHIP_COLORS[d.kind]}`,
                color: DECISION_CHIP_COLORS[d.kind],
                padding: "6px 14px",
                fontSize: 17,
                letterSpacing: 2,
                whiteSpace: "nowrap",
              }}
            >
              {d.kindLabel}
            </div>
            <div style={{ display: "flex", marginLeft: 18, flex: 1, minWidth: 0, fontSize: 28, fontWeight: 700 }}>
              {d.title}
            </div>
            {d.authorHandle ? (
              <div style={{ display: "flex", marginLeft: 18, color: palette.muted, fontSize: 20, whiteSpace: "nowrap" }}>
                @{d.authorHandle}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", marginTop: 14, color: palette.muted, fontSize: 21, lineHeight: 1.65 }}>
            {d.note}
          </div>
          {d.editorHandle ? (
            <div style={{ display: "flex", marginTop: 12, color: palette.green, fontSize: 17 }}>
              — @{d.editorHandle} 精选
            </div>
          ) : null}
        </div>
      ))}
      {snapshot.decisionsMore > 0 ? (
        <div style={{ display: "flex", marginTop: 24, color: palette.muted, fontSize: 18 }}>
          还有 {snapshot.decisionsMore} 条定夺,站内查看全部
        </div>
      ) : null}
    </div>
  );
}

export function LetterSharePoster({ snapshot }: { snapshot: LetterShareSnapshot }) {
  const s = snapshot;
  const meta = SECTION_META[s.section];
  const notes = [`kimi.builders/blog/${s.slug}`];
  if (s.section === "facts") notes.push("VERIFIED COMMUNITY RECORD");
  if (s.section === "decisions") notes.push("EDITORIAL RECORD · 定夺到人");
  if (s.aiNote) notes.push(`AI 参与披露:${s.aiNote}`);
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        background: palette.background,
        color: palette.paper,
        padding: POSTER_PADDING,
        fontFamily: POSTER_FONT_FAMILY,
      }}
    >
      <PosterHeader
        section="LETTER"
        eyebrow={`ISSUE ${String(s.issue).padStart(2, "0")} · ${s.month}`}
        chip={`${meta.no} ${meta.en}`}
        initials={s.initials}
        name={s.title}
        handle={s.editorHandle}
        linkLabel={`kimi.builders/blog/${s.slug}`}
      />

      <main
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: "column",
          justifyContent: "center",
          padding: "34px 0 30px",
        }}
      >
        <SectionTitle meta={meta} />
        {s.section === "facts" ? <FactsBody facts={s.facts} /> : null}
        {s.section === "decisions" ? <DecisionsBody snapshot={s} /> : null}
      </main>

      <PosterFooter
        url={s.url}
        headline={`@${s.editorHandle} · ${s.month}`}
        scanHint={meta.scanHint}
        notes={notes}
      />
    </div>
  );
}
