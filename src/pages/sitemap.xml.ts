// sitemap.xml, built from the page list in seo.ts so a new page is added in one place.
import { PAGES, SITE, UPDATED } from "../lib/seo.ts";

const extra = ["/impressum/", "/datenschutz/", "/cookies/"];

export function GET() {
  const projectKeys = Object.keys(PAGES).filter((k) => !["home", "projects"].includes(k));
  const urls = [
    "/",
    "/projects/",
    ...projectKeys.flatMap((k) => [PAGES[k].path, `${PAGES[k].path}method/`]),
    ...extra,
  ];
  const body = urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
