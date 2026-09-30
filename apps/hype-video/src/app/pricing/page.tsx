import { PLANS, capabilityStatuses, formatPrice } from "@hl-bos/hype-video";

export default function Pricing() {
  const payments = capabilityStatuses().find((c) => c.key === "payments");
  return (
    <div>
      <div className="kicker">Pricing</div>
      <h1>Plans</h1>
      <p className="lede">Everything is free while 5-Star Hype Video is in preview.</p>
      <div className="notice warn" style={{ marginBottom: 20 }}>
        <strong>Payments aren&apos;t connected.</strong> These are the planned prices.
        Nothing can be bought or charged yet, so the buttons are switched off.{" "}
        {payments?.detail}
      </div>
      <div className="grid-3">
        {PLANS.map((plan) => (
          <section
            key={plan.key}
            className={`card plan${plan.key === "family_monthly" ? " featured" : ""}`}
          >
            <div className="kicker">{plan.audience}</div>
            <h2 style={{ margin: 0 }}>{plan.name}</h2>
            <div className="price">{formatPrice(plan)}</div>
            <ul>
              {plan.includes.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            {plan.priceCents === 0 ? (
              <span className="badge generated">Included now</span>
            ) : (
              <button type="button" className="btn secondary" disabled>
                Upgrade — coming soon
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
