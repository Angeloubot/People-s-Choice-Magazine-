
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const SITE_URL = "https://peopleschoicemagazine.co.zw";
const OUTPUT_DIR = "share";
const DEFAULT_IMAGE = `${SITE_URL}/logo.png`;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Supabase secrets are missing.");
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function cleanText(value = "", maxLength = 300) {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeImage(...values) {
  for (const value of values) {
    try {
      if (!value) continue;

      const parsed = new URL(value);

      if (parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch {
      continue;
    }
  }

  return DEFAULT_IMAGE;
}

function makeSlug(value) {
  return String(value || "content")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "content";
}

async function getData(table, filters) {
  const params = new URLSearchParams({
    select: "*",
    ...filters
  });

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${params}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${table}: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

function createHTML(item, type, shareUrl, destination) {
  const titleText = cleanText(
    type === "song"
      ? `${item.title || ""} - ${item.artist || ""}`
      : item.title || "People's Choice Magazine",
    150
  );

  const descriptionText = cleanText(
    item.excerpt ||
    item.description ||
    (type === "song"
      ? `Listen to ${titleText} on People's Choice Magazine.`
      : `Discover ${titleText} on People's Choice Magazine.`),
    300
  );

  const title = escapeHTML(titleText);
  const description = escapeHTML(descriptionText);

  const imageUrl = safeImage(
    item.image_url,
    item.cover_url,
    item.thumbnail_url,
    item.featured_image,
    item.cover_image,
    item.image
  );

  const image = escapeHTML(imageUrl);
  const safeShareUrl = escapeHTML(shareUrl);
  const safeDestination = escapeHTML(destination);

  const ogType = type === "article"
    ? "article"
    : "website";

  return `<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>${title} | People's Choice Magazine</title>

<meta name="description" content="${description}">
<meta name="robots" content="index,follow,max-image-preview:large">

<meta name="theme-color" content="#171717">

<!-- OPEN GRAPH / WHATSAPP / FACEBOOK -->

<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="People's Choice Magazine">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${safeShareUrl}">
<meta property="og:image" content="${image}">
<meta property="og:image:secure_url" content="${image}">
<meta property="og:image:alt" content="${title}">
<meta property="og:locale" content="en_ZW">

<!-- TWITTER / X -->

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${title}">

<!-- CANONICAL URL -->

<link rel="canonical" href="${safeShareUrl}">

<!-- WEBSITE ICON -->

<link rel="icon" type="image/png" href="${DEFAULT_IMAGE}">

</head>

<body style="
  margin:0;
  padding:30px 15px;
  background:#171717;
  color:white;
  font-family:Arial,sans-serif;
  text-align:center;
">

<main style="
  max-width:600px;
  margin:30px auto;
  padding:25px;
  background:#222;
  border-radius:12px;
">

<img
  src="${image}"
  alt="${title}"
  style="
    width:100%;
    max-height:350px;
    object-fit:cover;
    border-radius:8px;
  "
>

<h1 style="font-size:26px;line-height:1.4;">
${title}
</h1>

<p style="
  color:#ccc;
  font-size:15px;
  line-height:1.7;
">
${description}
</p>

<p style="margin-top:25px;">
<a
  href="${safeDestination}"
  style="
    display:inline-block;
    padding:14px 25px;
    background:#e91e63;
    color:white;
    text-decoration:none;
    border-radius:6px;
    font-weight:bold;
  "
>
Read More
</a>
</p>

<p style="font-size:12px;color:#aaa;">
People's Choice Magazine
</p>

</main>

</body>
</html>`;
}

async function generate() {
  const articles = await getData("articles", {
    status: "eq.published",
    order: "published_at.desc"
  });

  const songs = await getData("chart_songs", {
    is_approved: "eq.true",
    is_active: "eq.true",
    order: "sort_order.asc"
  });

  const videos = await getData("videos", {
    status: "eq.published",
    order: "created_at.desc"
  });

  const collections = [
    { type: "article", items: articles },
    { type: "song", items: songs },
    { type: "video", items: videos }
  ];

  let total = 0;

  for (const collection of collections) {
    for (const item of collection.items) {
      if (!item.id) continue;

      const id = String(item.id);

      const slugSource = collection.type === "song"
        ? `${item.title || ""} - ${item.artist || ""}`
        : item.title || "content";

      const slug = makeSlug(slugSource);
      const folderName = `${slug}-${id}`;

      const shareUrl =
        `${SITE_URL}/${OUTPUT_DIR}/${collection.type}/${folderName}/`;

      let destination;

      if (collection.type === "article") {
        destination =
          `${SITE_URL}/article.html?id=${encodeURIComponent(id)}`;
      } else if (collection.type === "song") {
        destination =
          `${SITE_URL}/#song-${encodeURIComponent(id)}`;
      } else {
        destination =
          `${SITE_URL}/#video-${encodeURIComponent(id)}`;
      }

      const folder = path.join(
        OUTPUT_DIR,
        collection.type,
        folderName
      );

      fs.mkdirSync(folder, { recursive: true });

      fs.writeFileSync(
        path.join(folder, "index.html"),
        createHTML(
          item,
          collection.type,
          shareUrl,
          destination
        ),
        "utf8"
      );

      total++;

      console.log(
        `Generated ${collection.type}: ${titleTextForLog(item)}`
      );
    }
  }

  console.log(
    `Successfully generated ${total} sharing pages.`
  );
}

function titleTextForLog(item) {
  return item.title || item.id || "Untitled";
}

generate().catch(error => {
  console.error("Social preview generation failed:", error);
  process.exit(1);
});
