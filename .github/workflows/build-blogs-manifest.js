/**
 * build-blogs-manifest.js
 * Reads every .md file in content/blogs/, parses frontmatter,
 * and writes docs/_data/blogs-manifest.json
 *
 * Run automatically by GitHub Actions on every push to content/blogs/
 * Can also be run locally:  node .github/scripts/build-blogs-manifest.js
 */

const fs   = require("fs");
const path = require("path");
const matter = require("gray-matter");

const BLOGS_DIR  = path.join(__dirname, "../../content/blogs");
const OUTPUT_DIR = path.join(__dirname, "../../docs/_data");
const OUTPUT     = path.join(OUTPUT_DIR, "blogs-manifest.json");

// Make sure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read all .md files
if (!fs.existsSync(BLOGS_DIR)) {
  console.log("No content/blogs/ directory found — writing empty manifest.");
  fs.writeFileSync(OUTPUT, JSON.stringify([], null, 2));
  process.exit(0);
}

const files = fs.readdirSync(BLOGS_DIR).filter(f => f.endsWith(".md"));

const posts = files.map(filename => {
  const filepath = path.join(BLOGS_DIR, filename);
  const raw      = fs.readFileSync(filepath, "utf8");
  const parsed   = matter(raw);

  // slug = filename without .md
  const slug = filename.replace(/\.md$/, "");

  return {
    slug,
    title:            parsed.data.title            || "",
    date:             parsed.data.date             || "",
    author:           parsed.data.author           || "",
    author_initials:  parsed.data.author_initials  || "",
    cover_image:      parsed.data.cover_image      || "",
    excerpt:          parsed.data.excerpt          || "",
    meta_description: parsed.data.meta_description || "",
    draft:            parsed.data.draft            || false,
    // include first 300 chars of body as fallback excerpt
    body_preview: parsed.content.trim().slice(0, 300),
  };
});

// Sort by date descending (newest first)
posts.sort((a, b) => {
  const da = a.date ? new Date(a.date) : new Date(0);
  const db = b.date ? new Date(b.date) : new Date(0);
  return db - da;
});

fs.writeFileSync(OUTPUT, JSON.stringify(posts, null, 2));
console.log(`✅ Wrote ${posts.length} post(s) to docs/_data/blogs-manifest.json`);
posts.forEach(p => console.log(`   - ${p.slug} (draft: ${p.draft})`));