#!/usr/bin/env node
/* 生成邮件客户端用的 PNG logo:
   public/brand/logo-tile.svg(小尺寸几何:去轨道、月亮/双星放大)
   → public/brand/logo-email.png(192×192,圆角瓷砖外透明)。
   邮件客户端(QQ/163/Gmail)对 SVG 支持差,必须 PNG;可重复执行,产物提交进仓库。 */
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
