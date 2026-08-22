#!/usr/bin/env node
/* Generate the PNG logo for email clients:
   public/brand/logo-tile.svg (small-size geometry: orbit removed,
   moon/twin-stars enlarged) -> public/brand/logo-email.png (192x192,
   transparent outside the rounded tile). Email clients (QQ/163/Gmail)
   handle SVG poorly — PNG it is; idempotent, and the artifact is
   committed. */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const ROOT = new URL("../", import.meta.url).pathname;
const SRC = `${ROOT}public/brand/logo-tile.svg`;
const OUT = `${ROOT}public/brand/logo-email.png`;

const svg = readFileSync(SRC);
await sharp(svg, { density: 384 })
  .resize(192, 192)
  .png()
  .toFile(OUT);
console.log(`wrote ${OUT.replace(ROOT, "")} (192x192)`);
