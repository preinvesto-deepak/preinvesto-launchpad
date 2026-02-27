#!/usr/bin/env node
/**
 * Scans /public/portfolio/<category>/<project>/ folders and generates
 * /public/portfolio/index.json with all project metadata.
 */
import { readdirSync, statSync, writeFileSync, existsSync } from "fs";
import { join, extname } from "path";

const PORTFOLIO_ROOT = join(process.cwd(), "public", "portfolio");
const CATEGORIES = ["interiors", "construction", "commercial"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const VIDEO_EXTS = [".mp4", ".webm", ".mov"];

function toTitleCase(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function findFile(dir, baseName, extensions) {
  for (const ext of extensions) {
    const f = `${baseName}${ext}`;
    if (existsSync(join(dir, f))) return f;
  }
  return null;
}

function getGalleryImages(dir) {
  const files = readdirSync(dir);
  const imageFiles = files.filter((f) => {
    const ext = extname(f).toLowerCase();
    const name = f.replace(ext, "");
    return IMAGE_EXTS.includes(ext) && /^image\d+$/.test(name);
  });
  // Sort numerically: image2 before image10
  imageFiles.sort((a, b) => {
    const numA = parseInt(a.match(/image(\d+)/)?.[1] || "0", 10);
    const numB = parseInt(b.match(/image(\d+)/)?.[1] || "0", 10);
    return numA - numB;
  });
  return imageFiles;
}

function buildIndex() {
  const index = { categories: [], projects: [] };

  for (const category of CATEGORIES) {
    const catDir = join(PORTFOLIO_ROOT, category);
    if (!existsSync(catDir) || !statSync(catDir).isDirectory()) continue;

    index.categories.push(category);

    const projectFolders = readdirSync(catDir).filter((f) =>
      statSync(join(catDir, f)).isDirectory()
    );

    for (const slug of projectFolders) {
      const projectDir = join(catDir, slug);
      const featured = findFile(projectDir, "featured", IMAGE_EXTS);
      const summaryVideo = findFile(projectDir, "summary", VIDEO_EXTS);
      const galleryImages = getGalleryImages(projectDir);

      const coverImage = featured || galleryImages[0] || null;
      if (!coverImage && !summaryVideo) continue; // skip empty projects

      index.projects.push({
        category,
        slug,
        displayName: toTitleCase(slug),
        coverImage: coverImage
          ? `/portfolio/${category}/${slug}/${coverImage}`
          : null,
        featuredImage: featured
          ? `/portfolio/${category}/${slug}/${featured}`
          : null,
        summaryVideo: summaryVideo
          ? `/portfolio/${category}/${slug}/${summaryVideo}`
          : null,
        galleryImages: galleryImages.map(
          (f) => `/portfolio/${category}/${slug}/${f}`
        ),
      });
    }
  }

  writeFileSync(
    join(PORTFOLIO_ROOT, "index.json"),
    JSON.stringify(index, null, 2)
  );
  console.log(
    `✅ Portfolio index generated: ${index.projects.length} projects across ${index.categories.length} categories`
  );
}

buildIndex();
