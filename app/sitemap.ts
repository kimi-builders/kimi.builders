/* sitemap.xml: static public routes + recent public content from
   src/lib/sitemap-data (fail-soft: a DB outage yields the static
   routes only). Revalidated hourly — content churn doesn't need
   fresher. */
import type { MetadataRoute } from "next";
import { getSitemapData, sitemapUrls } from "@/src/lib/sitemap-data";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls = sitemapUrls(await getSitemapData());
  return urls.map((url) => ({ url }));
}
