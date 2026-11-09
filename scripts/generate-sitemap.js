
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SITE_URL = "https://peopleschoicemagazine.com";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function stripHTML(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteImageURL(value) {
  if (!value) return "";

  try {
    const url = new URL(value, SITE_URL);
    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

async function generate() {
  console.log("Fetching published articles...");

  let articles = [];
  let start = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, excerpt, author, category, section, image_url, published_at, created_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) throw error;

    articles.push(...data);

    if (data.length < pageSize) break;
    start += pageSize;
  }

  console.log(`Found ${articles.length} published articles.`);

  const urls = [
    {
      loc: SITE_URL + "/",
      lastmod: new Date().toISOString()
    }
  ];

  for (const article of articles) {
    const id = String(article.id);

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      console.warn("Skipping invalid article ID:", id);
      continue;
    }

    const title = escapeHTML(
      article.title || "People's Choice Magazine"
    );

    const description = escapeHTML(
      stripHTML(article.excerpt).slice(0, 250) ||
      "Read the latest stories on People's Choice Magazine."
    );

    const image = absoluteImageURL(article.image_url);
    const author = escapeHTML(article.author || "People's Choice Editorial Team");
    const category = escapeHTML(article.category || "News");

    const previewURL = `${SITE_URL}/articles/${encodeURIComponent(id)}/`;
    const originalURL = `${SITE_URL}/article.html?id=${encodeURIComponent(id)}`;

    const imageTags = image ? `
<meta property="og:image" content="${escapeHTML(image)}">
<meta property="og:image:secure_url" content="${escapeHTML(image)}">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:image" content="${escapeHTML(image)}">` : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>${title} | People's Choice Magazine</title>
<meta name="description" content="${description}">
<meta name="author" content="${author}">
<meta name="robots" content="index, follow">

<link rel="canonical" href="${escapeHTML(previewURL)}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="People's Choice Magazine">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHTML(previewURL)}">
<meta property="article:section" content="${category}">
${imageTags}

<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">

<meta http-equiv="refresh" content="0;url=${escapeHTML(originalURL)}">

</head>
<body>
<p>Opening article...</p>
<p><a href="${escapeHTML(originalURL)}">Read ${title}</a></p>
<script>
window.location.replace(${JSON.stringify(originalURL)});
</script>
</body>
</html>`;

    const outputDir = path.join("articles", id);

    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(
      path.join(outputDir, "index.html"),
      html,
      "utf8"
    );

    urls.push({
      loc: previewURL,
      lastmod: article.published_at || article.created_at
    });

    console.log("Generated preview:", id);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(item => `  <url>
    <loc>${escapeHTML(item.loc)}</loc>
    ${item.lastmod ? `<lastmod>${new Date(item.lastmod).toISOString()}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>`;

  fs.writeFileSync("sitemap.xml", xml, "utf8");

  console.log("Sitemap and social preview pages generated successfully!");
}

generate().catch(error => {
  console.error("Generation error:", error);
  process.exit(1);
});
