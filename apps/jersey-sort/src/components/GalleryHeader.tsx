import type { PublicGallery } from "@/lib/repo/galleries.ts";

/** The top of every team gallery page: the photographer's brand, then the team. */
export function GalleryHeader({ gallery }: { gallery: PublicGallery }) {
  return (
    <header className="mb-6 border-b border-line pb-4">
      <p
        className="display text-sm uppercase tracking-widest text-brand"
        data-testid="gallery-brand"
      >
        {gallery.organizationName}
      </p>
      <h1 className="display text-3xl" data-testid="gallery-title">
        {gallery.groupName ? `${gallery.groupName} · ${gallery.name}` : gallery.name}
      </h1>
    </header>
  );
}
