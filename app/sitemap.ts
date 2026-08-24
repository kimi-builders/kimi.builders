/* sitemap.xml: static public routes + recent public content from
   src/lib/sitemap-data. Generate it at request time because release
   builds intentionally do not receive production database credentials;
   cache the shared query result for one hour at runtime. */
import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { getSitemapData, sitemapUrls } from "@/src/lib/sitemap-data";

export const dynamic = "force-dynamic";

const getCachedSitemapData = unstable_cache(getSitemapData, ["sitemap-data"], {
  revalidate: 3600,
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls = sitemapUrls(await getCachedSitemapData());
  return urls.map((url) => ({ url }));
}
