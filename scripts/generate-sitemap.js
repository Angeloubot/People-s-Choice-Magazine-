
const { createClient } = await import("@supabase/supabase-js");
const fs = require("fs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const SITE_URL = "https://peopleschoicemagazine.com";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function escapeXML(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[char]);
}

async function getPublishedArticles() {
  let articles = [];
  let start = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("articles")
      .select("id, published_at, created_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) throw error;

    articles = articles.concat(data);

    if (data.length < pageSize) break;

    start += pageSize;
  }

  return articles;
}

async function generateSitemap() {
  console.log("Fetching published magazine articles...");

  const articles = await getPublishedArticles();

  const urls = [
    {
      loc: `${SITE_URL}/`,
      lastmod: new Date().toISOString()
    },
    ...articles.map(article => ({
      loc: `${SITE_URL}/article.html?id=${encodeURIComponent(article.id)}`,
      lastmod: article.published_at || article.created_at
    }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(item => `  <url>
    <loc>${escapeXML(item.loc)}</loc>
    ${item.lastmod ? `<lastmod>${new Date(item.lastmod).toISOString()}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>`;

  fs.writeFileSync("sitemap.xml", xml, "utf8");

  console.log(`Successfully generated sitemap with ${articles.length} articles.`);
}

generateSitemap().catch(error => {
  console.error("Sitemap generation failed:", error);
  process.exit(1);
});
