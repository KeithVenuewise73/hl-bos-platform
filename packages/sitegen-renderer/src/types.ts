export interface RenderContext {
  /** Canonical origin of the published site, e.g. "https://main-street.example.com". Must be https. */
  origin: string;
  /** URLs the host already resolved from asset ids. The renderer never looks anything up. */
  assets?: {
    logoUrl?: string;
    /** Resolved from hero.choice (library or uploaded asset). Absent = themed gradient hero. */
    heroUrl?: string;
    /** Gallery image URLs by assetId. An item with no entry here is not rendered. */
    gallery?: Record<string, string>;
  };
  /** ISO date used as <lastmod> in sitemap entries; omitted from entries when absent. */
  lastModified?: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export interface RenderedPage {
  slug: string;
  /** Path on the site: "/" for the first page, "/<slug>" for the rest. */
  path: string;
  title: string;
  /** Tags for <head> (title, meta, canonical, Open Graph, JSON-LD), as markup. */
  headTags: string;
  /** The complete document. */
  html: string;
}

export interface RenderedSite {
  /** The first page's complete document (the home page). */
  html: string;
  /** The first page's head tags. */
  headTags: string;
  pages: RenderedPage[];
  sitemapEntries: SitemapEntry[];
}
