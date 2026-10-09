import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SeriesGridCard from "../app/(app)/explore/_components/SeriesGridCard";
import SeriesRowCard from "../app/(app)/explore/_components/SeriesRowCard";
import { availableExploreChapters } from "../src/lib/explore-filters";
import { LEARN_SERIES } from "../src/lib/learn-series";

const series = LEARN_SERIES.find((entry) => entry.chapter === "build")!;

for (const [name, Card] of [["grid", SeriesGridCard], ["row", SeriesRowCard]] as const) {
  test(`${name} series card retains chapter labels without issuing ignored chapter links`, () => {
    for (const counts of [[], [{ value: "build", count: 4 }]]) {
      const chapters = availableExploreChapters(counts);
      for (const zh of [true, false]) {
        const html = renderToStaticMarkup(createElement(Card, {
          series, episodes: [], zh,
          chapterBrowsable: !!series.chapter && chapters.includes(series.chapter),
        }));
        assert.doesNotMatch(html, /href="\/explore\?chapter=/);
        assert.match(html, new RegExp(`href="/explore/series/${series.slug}"`));
        assert.ok(html.includes(zh ? "做" : "BUILD"));
      }
    }
  });

  test(`${name} series card links only to a populated chapter with a comparable sibling`, () => {
    for (const [counts, linked] of [
      [[{ value: "build", count: 4 }, { value: "learn", count: 1 }], true],
      [[{ value: "learn", count: 1 }, { value: "gain", count: 1 }], false],
    ] as const) {
      const chapters = availableExploreChapters(counts);
      const html = renderToStaticMarkup(createElement(Card, {
        series, episodes: [], zh: true,
        chapterBrowsable: !!series.chapter && chapters.includes(series.chapter),
      }));
      assert.equal(html.includes('href="/explore?chapter=build"'), linked);
    }
  });
}
