// Local barbershop page fixtures. No network: HTML strings only.
//
// Shaped after what the WNY prospect list actually shows — several shops with
// no owned site at all, several running a booking-platform-hosted page, and a
// handful with a real site that is missing the basics. None of these are copies
// of a real shop's page; they are the SHAPES those pages take.

/** A shop doing it right: owned domain, booking, hours, prices, map, reviews. */
export const GOOD_BARBER_HTML = `<!doctype html><html lang="en"><head>
<title>Elmwood Barber Co. — Barbershop in Buffalo, NY</title>
<meta name="description" content="Walk-in and online booking barbershop on Elmwood Ave in Buffalo. Fades, beard trims and hot towel shaves.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@type":"BarberShop","name":"Elmwood Barber Co."}</script>
</head><body>
<h1>Elmwood Barber Co.</h1>
<a href="https://booksy.com/en-us/elmwood-barber">Book Now</a>
<a href="tel:+17165550100">(716) 555-0100</a>
<h2>Hours</h2><p>Mon-Fri 9:00 am - 7:00 pm, Sat 9:00 am - 5:00 pm</p>
<h2>Services</h2><ul><li>Haircut $35</li><li>Beard trim $20</li><li>Hot towel shave $45</li></ul>
<h2>Find us</h2><p>742 Elmwood Ave, Buffalo, NY 14222</p>
<iframe src="https://www.google.com/maps/embed?pb=abc"></iframe>
<h2>Reviews</h2><p>What our clients say: rated 4.9 out of 5.</p>
<h2>Meet the team</h2><p>Our barbers have been cutting on Elmwood for twelve years.</p>
<img src="/1.jpg" alt="shop front"><img src="/2.jpg" alt="fade"><img src="/3.jpg" alt="beard trim">
<a href="https://instagram.com/elmwoodbarber">Instagram</a>
</body></html>`;

/** The common WNY shape: a real domain, but almost nothing on the page. */
export const BARE_BARBER_HTML = `<!doctype html><html><head>
<title>Cuts</title>
</head><body>
<h1>Cuts</h1>
<p>Best barbers around. Call 716-555-0142 to make an appointment.</p>
<img src="/hero.png">
</body></html>`;

/**
 * The shop whose "website" is a booking platform's hosted page. Booking works;
 * the shop owns none of it. This is the direct hook for `owned_website`.
 */
export const GLOSSGENIUS_HOSTED_HTML = `<!doctype html><html lang="en"><head>
<title>Northtown Fades | GlossGenius</title>
<meta name="description" content="Book Northtown Fades online.">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
<h1>Northtown Fades</h1>
<a href="#book">Book an appointment</a>
<p>Haircut $30 · Line up $15</p>
<p>Tue-Sat 10:00 am - 6:00 pm</p>
<p>1180 Niagara Falls Blvd, Tonawanda, NY</p>
<img src="/a.jpg" alt="cut"><img src="/b.jpg" alt="cut"><img src="/c.jpg" alt="cut">
<a href="tel:+17165550188">Call</a>
</body></html>`;

/** No booking anywhere, no hours, not mobile-ready, served over HTTP. */
export const NO_BOOKING_HTTP_HTML = `<!doctype html><html><head>
<title>Southside Barber Shop</title>
</head><body>
<h1>Southside Barber Shop</h1>
<p>Walk-ins welcome. Haircut and beard trim.</p>
<p>Phone: 716-555-0177</p>
<img src="http://southside.example/old.gif">
</body></html>`;
