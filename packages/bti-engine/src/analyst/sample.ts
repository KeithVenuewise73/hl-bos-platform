// A demonstration business + a REAL homepage HTML snapshot to analyze on click.
// The analyzer reads genuine signals from this HTML; for a live customer the
// consultant pastes or fetches the customer's own page instead. Clearly a demo.

export const SAMPLE_BUSINESS = {
  name: "Rivertown Logistics",
  website: "https://rivertown-logistics.example.com",
  industry: "transportation",
  location: "Columbus, OH",
};

// A small-business homepage: HTTPS + a title, but weak on meta description,
// no structured data, one social link, no analytics, and no lead-capture form —
// so the analysis surfaces several genuine, evidence-backed opportunities.
export const SAMPLE_HTML = `<!doctype html>
<html>
<head>
  <title>Rivertown Logistics — Regional Freight & Warehousing</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <header>
    <h1>Rivertown Logistics</h1>
    <nav><a href="/services">Services</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
  </header>
  <main>
    <section>
      <h2>Regional freight, warehousing, and last-mile delivery</h2>
      <p>Rivertown Logistics has moved freight across the Midwest for over 20 years. We run a
      modern fleet, a 120,000 sq ft distribution center, and a team that treats your cargo like
      our own. From LTL to full truckload, scheduled routes to on-demand runs, we keep your
      supply chain moving.</p>
      <img src="/img/fleet.jpg">
      <img src="/img/warehouse.jpg">
    </section>
    <section>
      <h2>Our services</h2>
      <h3>Freight</h3><p>LTL and FTL across the Midwest with reliable transit times.</p>
      <h3>Warehousing</h3><p>Short and long-term storage with inventory visibility.</p>
      <h3>Last-mile</h3><p>Scheduled and on-demand local delivery.</p>
    </section>
    <footer>
      <a href="https://facebook.com/rivertownlogistics">Facebook</a>
      <p>Call dispatch during business hours.</p>
    </footer>
  </main>
</body>
</html>`;
