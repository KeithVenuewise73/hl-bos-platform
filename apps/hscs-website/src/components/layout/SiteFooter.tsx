import Link from "next/link";
import { BRAND, FOOTER } from "@/lib/content";
import { effectiveHref } from "@/components/ui/primitives";

// Persistent footer (Homepage Copy S12): a final CTA band, the full-site sitemap,
// the approved boilerplate, and the utility/legal row. Server component — no
// interactivity.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-cta section--tight">
        <div className="container footer-cta__inner">
          <div>
            <p className="h2">{FOOTER.ctaHeadline}</p>
            <p className="body-l footer-cta__sub">{FOOTER.ctaSubline}</p>
          </div>
          <Link href={FOOTER.primaryCta.href} className="btn btn--primary btn--lg">
            {FOOTER.primaryCta.label}
          </Link>
        </div>
      </div>

      <div className="container section--tight">
        <nav className="footer-grid" aria-label="Footer">
          {FOOTER.columns.map((col) => (
            <div key={col.heading} className="footer-col">
              <p className="label footer-col__heading">{col.heading}</p>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={effectiveHref(link)}
                      className="footer-col__link"
                      title={
                        link.status === "pending"
                          ? "This section is being prepared"
                          : undefined
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="body-s footer-boilerplate measure">{FOOTER.boilerplate}</p>

        <div className="footer-bottom">
          <p className="body-s muted">{FOOTER.copyright}</p>
          <ul className="footer-legal">
            {FOOTER.legal.map((item) => (
              <li key={item.label}>
                <Link
                  href={effectiveHref(item)}
                  className="footer-col__link"
                  title="This section is being prepared"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="visually-hidden">
        {BRAND.name} — {BRAND.descriptor}
      </p>
    </footer>
  );
}
