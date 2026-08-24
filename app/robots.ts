/* robots.txt: everything public is crawlable; consoles, auth, APIs and
   the device-approval flow stay out. */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/settings", "/api", "/usage/device", "/login"],
    },
    sitemap: "https://kimi.builders/sitemap.xml",
  };
}
