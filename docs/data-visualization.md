# Kimi Builders Data Visualization

This document is the implementation contract for data cards and charts in
Kimi Builders. The system follows Kimi's published palette and chart language
while preserving the product's dark, light, Poster, and Soft modes.

## Color roles

Use semantic tokens from app/globals.css. Do not add raw chart colors inside
components.

| Role | Token | Value |
| --- | --- | --- |
| Deep brand | viz-blue-deep | #002F5B |
| Primary focus | viz-blue-primary | #007CFF |
| Secondary blue | viz-blue-bright | #00A1FF |
| Soft blue | viz-blue-soft | #A0DAF7 |
| Electric peak | viz-blue-electric | #00F6FF |
| Experimental | viz-purple-soft | #DFC8F5 |
| Risk | viz-red-soft | #FFD1D4 |
| Healthy | viz-green-soft | #B3F4A8 |
| Attention | viz-yellow-soft | #F4F9A7 |

Pastels are fills and markers, not small text colors on white. Use labels,
icons, ordering, and patterns alongside color.

## Chart rules

- Highlight one current or leading series with viz-blue-primary.
- Render comparison series with neutral gray.
- Keep categorical charts to five visible series and merge the rest.
- Start bars at zero and put values at the end or above the peak.
- Use dotted or dashed low-contrast grid lines.
- Prefer horizontal bars for agents, models, projects, and long labels.
- Use donut charts only for two to five stable categories.
- Keep token composition in tooltips when total usage is the comparison task.
- Distinguish zero usage from missing collection data.

## Icons

All agent marks come from @lobehub/icons through AgentIcon.

- inline is the default text and navigation context.
- chart normalizes marks to a 16 px optical box.
- badge adds the compact identity container used by rankings.
- Kimi marks use the Kimi glyph with the local black badge treatment.
- UI actions continue to use Lucide; UI icons never substitute for brands.

## Data trust

Every analytical view should state its time range, source, freshness, and
coverage where relevant.

- Attribution must be computed from the same joint fact rows.
- Shares must say whether the denominator is all usage or attributable usage.
- Missing projects remain unattributed and are never inferred.
- Estimated, legacy, unpriced, and exact measurements remain distinguishable.
- Public profiles never expose private project attribution.

## Shared components

Use MetricCard, DataMeta, InsightHeader, ChartHeader, CoverageBadge, and
UsageInsightPanel before creating another card grammar.
