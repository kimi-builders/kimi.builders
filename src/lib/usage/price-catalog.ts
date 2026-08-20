import { createHash } from "node:crypto";

import rawCatalog from "@/src/data/usage-pricing/catalog-v1.json";

const RATE_FIELDS = [
  "input", "cacheWrite", "cacheWrite5m", "cacheWrite1h", "cacheRead", "output", "reasoning",
] as const;

export interface UsagePriceCatalogEntry {
  pattern: string;
  match: "exact" | "prefix";
  source: string | null;
  contextTier: string;
  processingTier: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  input: string;
  cacheWrite: string | null;
  cacheWrite5m: string | null;
  cacheWrite1h: string | null;
  cacheRead: string | null;
  output: string;
  reasoning: string | null;
  sourceUrl: string;
  verifiedAt: string;
  version: string;
  basis: "standard-api";
}

export interface UsagePriceCatalog {
  schemaVersion: 1;
  matcherVersion: 1;
  revision: number;
  catalogVersion: string;
  publishedAt: string;
  currency: "USD";
  basis: "standard-api";
  entries: UsagePriceCatalogEntry[];
  integrity: { algorithm: "sha256"; digest: string };
}

function catalogDigest(catalog: Omit<UsagePriceCatalog, "integrity">): string {
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}

function validateCatalog(value: unknown): UsagePriceCatalog {
  if (!value || typeof value !== "object") throw new Error("Usage price catalog must be an object");
  const catalog = value as UsagePriceCatalog;
  if (catalog.schemaVersion !== 1 || catalog.matcherVersion !== 1) {
    throw new Error("Unsupported usage price catalog contract");
  }
  if (!Number.isSafeInteger(catalog.revision) || catalog.revision < 1) {
    throw new Error("Invalid usage price catalog revision");
  }
  if (catalog.currency !== "USD" || catalog.basis !== "standard-api" || !Array.isArray(catalog.entries)) {
    throw new Error("Invalid usage price catalog basis");
  }
  for (const entry of catalog.entries) {
    if (!entry.pattern || !["exact", "prefix"].includes(entry.match)) {
      throw new Error("Invalid usage price catalog match entry");
    }
    if (!Number.isFinite(Date.parse(entry.effectiveFrom)) || (entry.effectiveTo && !Number.isFinite(Date.parse(entry.effectiveTo)))) {
      throw new Error(`Invalid effective window for ${entry.pattern}`);
    }
    if (entry.effectiveTo && Date.parse(entry.effectiveTo) <= Date.parse(entry.effectiveFrom)) {
      throw new Error(`Invalid effective window order for ${entry.pattern}`);
    }
    for (const field of RATE_FIELDS) {
      const rate = entry[field];
      if (rate !== null && (!/^\d+(?:\.\d+)?$/.test(rate) || Number(rate) < 0)) {
        throw new Error(`Invalid ${field} rate for ${entry.pattern}`);
      }
    }
  }
  const { integrity, ...unsigned } = catalog;
  if (integrity?.algorithm !== "sha256" || catalogDigest(unsigned) !== integrity.digest) {
    throw new Error("Usage price catalog integrity check failed");
  }
  return catalog;
}

export const USAGE_PRICE_CATALOG = validateCatalog(rawCatalog);
export const USAGE_PRICE_CATALOG_ETAG = `"sha256-${USAGE_PRICE_CATALOG.integrity.digest}"`;
