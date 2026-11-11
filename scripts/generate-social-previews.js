
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const SITE_URL = "https://peopleschoicemagazine.co.zw";
const OUTPUT_DIR = "share";

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

function safeImage(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol)
      ? parsed.href
      : "";
  } catch {
    return "";
  }
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
  const titleText = type === "song"
    ? `${item.title || ""} - ${item.artist || ""}`
    : item.title || "People's Choice Magazine";

  const descriptionText =
    item.excerpt ||
    item.description ||
    (type === "song"
      ? `Listen to ${titleText} on People's Choice Magazine.`
      : "Discover this on People's Choice Magazine.");

  const title = escapeHTML(titleText);
  const description = escapeHTML(descriptionText);
  const image = safeImage(
    item.image_url || item.cover_url || item.thumbnail_url
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>${title} | People's Choice Magazine</title>
<meta name="description" content="${description}">
<meta name="robots" content="index,follow,max-image-preview:large">

<meta property="og:type" content="website">
<meta property="og:site_name" content="People's Choice Magazine">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHTML(shareUrl)}">

${image ? `
<meta property="og:image" content="${escapeHTML(image)}">
<meta property="og:image:secure_url" content="${escapeHTML(image)}">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHTML(image)}">
` : `
<meta name="twitter:card" content="summary">
`}

<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">

<link rel="canonical" href="${escapeHTML(shareUrl)}">

<meta http-equiv="refresh" content="1;url=${escapeHTML(destination)}">
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>

${image ? `<img src="${escapeHTML(image)}" alt="${title}" style="max-width:100%">` : ""}

<p>You are being redirected to People's Choice Magazine.</p>
<p><a href="${escapeHTML(destination)}">Continue to the content</a></p>

<script>
window.location.replace(${JSON.stringify(destination)});
</script>
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
        createHTML(item, collection.type, shareUrl, destination),
        "utf8"
      );

      total++;
      console.log(`Generated ${collection.type}: ${titleTextForLog(item)}`);
    }
  }

  console.log(`Successfully generated ${total} sharing pages.`);
}

function titleTextForLog(item) {
  return item.title || item.id || "Untitled";
}

generate().catch(error => {
  console.error("Social preview generation failed:", error);
  process.exit(1);
});
