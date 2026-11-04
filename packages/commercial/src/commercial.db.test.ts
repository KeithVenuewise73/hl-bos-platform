/**
 * Shared HL-BOS services against a REAL isolated PostgreSQL (all 54 HL-BOS
 * migrations + proposed P001), built by scripts/local-test/isolated-db.sh.
 *
 *   bash scripts/local-test/isolated-db.sh && HLBOS_PG_DB=hlbos_isolated pnpm --filter @hl-bos/commercial test
 *
 * Without HLBOS_PG_DB the suite is skipped and says so; it never pretends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IsolatedDb, isDbError } from "./db.ts";
import { handleStripeWebhook } from "./billing.ts";
import { stripeSignature } from "./stripe.ts";
import {
  MockTransport,
  deliverBatch,
  handleInboundSms,
  twilioSignature,
} from "./messaging.ts";
import {
  seedMember,
  seedServiceAccount,
  seedTenant,
  seedUser,
} from "./testing/seed.ts";

const env = process.env;
const DBNAME = env["HLBOS_PG_DB"];
const run = DBNAME ? describe : describe.skip;
const tag = () => Math.random().toString(36).slice(2, 8);

run(
  `shared HL-BOS services on isolated PostgreSQL (${DBNAME ?? "not configured"})`,
  () => {
    let db: IsolatedDb;
    let svc: string;
    let ownerA: string;
    let ownerB: string;
    let a: string;
    let b: string;
    const SECRET = "whsec_isolated_test_only";

    const licensed = async (tenant: string, module: string) =>
      db.superuser(
        async (c) =>
          (
            (
              await c.query("select entitlements.module_licensed($1,$2) ok", [
                tenant,
                module,
              ])
            ).rows[0] as { ok: boolean }
          ).ok,
      );
    const stripe = async (
      id: string,
      type: string,
      object: Record<string, unknown>,
    ) => {
      const body = JSON.stringify({ id, type, data: { object } });
      const t = Math.floor(Date.now() / 1000);
      return handleStripeWebhook(
        db,
        svc,
        body,
        `t=${t},v1=${stripeSignature(body, SECRET, t)}`,
        SECRET,
      );
    };

    beforeAll(async () => {
      db = new IsolatedDb({
        host: env["PGHOST"] ?? "/tmp/tmspg",
        port: Number(env["PGPORT"] ?? 5434),
        user: env["PGUSER"] ?? "postgres",
        database: DBNAME!,
      });
      const t = tag();
      svc = await seedServiceAccount(db, `billing-worker-${t}@example.test`);
      a = await seedTenant(db, `fleet-a-${t}`, "Company A (synthetic)");
      b = await seedTenant(db, `fleet-b-${t}`, "Company B (synthetic)");
      ownerA = await seedUser(db, `owner-a-${t}@example.test`);
      ownerB = await seedUser(db, `owner-b-${t}@example.test`);
      await seedMember(db, a, ownerA, "tenant_owner");
      await seedMember(db, b, ownerB, "tenant_owner");
    });
    afterAll(async () => db?.close());

    describe("H-1 subscription entitlement", () => {
      it("checkout activates exactly the plan's modules for exactly that company", async () => {
        const r = await stripe(`evt_${tag()}`, "checkout.session.completed", {
          subscription: "sub_a",
          metadata: { tenant_id: a, plan_key: "tms_dvir" },
        });
        expect(r).toMatchObject({ status: 200, outcome: "applied: active" });
        expect(await licensed(a, "tms_dvir")).toBe(true);
        expect(await licensed(a, "tms_fleet")).toBe(false);
        expect(await licensed(a, "tms_dispatch")).toBe(false);
        expect(await licensed(b, "tms_dvir")).toBe(false); // cross-tenant negative
      });

      it("a re-delivered event changes nothing", async () => {
        const id = `evt_${tag()}`;
        const obj = {
          id: "sub_a",
          status: "past_due",
          metadata: { tenant_id: a, plan_key: "tms_dvir" },
        };
        expect(await stripe(id, "customer.subscription.updated", obj)).toMatchObject({
          outcome: "applied: past_due",
        });
        expect(await stripe(id, "customer.subscription.updated", obj)).toMatchObject({
          outcome: "duplicate",
        });
      });

      it("failed payment restricts access; payment recovery restores it", async () => {
        await stripe(`evt_${tag()}`, "invoice.payment_failed", {
          subscription_details: { metadata: { tenant_id: a, plan_key: "tms_dvir" } },
        });
        expect(await licensed(a, "tms_dvir")).toBe(false);
        await stripe(`evt_${tag()}`, "invoice.paid", {
          subscription: "sub_a",
          metadata: { tenant_id: a, plan_key: "tms_dvir" },
        });
        expect(await licensed(a, "tms_dvir")).toBe(true);
      });

      it("cancellation restricts access without deleting the history", async () => {
        await stripe(`evt_${tag()}`, "customer.subscription.deleted", {
          id: "sub_a",
          metadata: { tenant_id: a, plan_key: "tms_dvir" },
        });
        expect(await licensed(a, "tms_dvir")).toBe(false);
        const kept = await db.superuser(
          async (c) =>
            (
              await c.query(
                `select (select status::text from billing.subscriptions where tenant_id=$1 and plan_key='tms_dvir') st,
                (select count(*)::int from billing.provider_events where tenant_id=$1) ev`,
                [a],
              )
            ).rows[0] as { st: string; ev: number },
        );
        expect(kept.st).toBe("canceled");
        expect(kept.ev).toBeGreaterThanOrEqual(5);
      });

      it("a suspended company loses every module even with a paid subscription", async () => {
        await stripe(`evt_${tag()}`, "checkout.session.completed", {
          subscription: "sub_b",
          metadata: { tenant_id: b, plan_key: "salon_operations" },
        });
        expect(await licensed(b, "salon_booking")).toBe(true);
        await db.superuser((c) =>
          c.query("update platform.tenants set status='suspended' where id=$1", [b]),
        );
        expect(await licensed(b, "salon_booking")).toBe(false);
        await db.superuser((c) =>
          c.query("update platform.tenants set status='active' where id=$1", [b]),
        );
      });

      it("a dependent module is unusable until its dependency is licensed", async () => {
        // salon_notifications needs booking or CRM; grant it alone.
        const t = await seedTenant(db, `dep-${tag()}`, "Dep (synthetic)");
        await db.superuser((c) =>
          c.query(
            `insert into entitlements.tenant_entitlements (tenant_id, feature_key, source) values ($1,'salon.notifications','grant')`,
            [t],
          ),
        );
        expect(await licensed(t, "salon_notifications")).toBe(false);
        await db.superuser((c) =>
          c.query(
            `insert into entitlements.tenant_entitlements (tenant_id, feature_key, source) values ($1,'salon.crm','grant')`,
            [t],
          ),
        );
        expect(await licensed(t, "salon_notifications")).toBe(true);
      });

      it("an unsigned or tampered webhook is refused before the database is touched", async () => {
        const body = JSON.stringify({
          id: "evt_forged",
          type: "checkout.session.completed",
          data: { object: { metadata: { tenant_id: b, plan_key: "tms_complete" } } },
        });
        expect(
          await handleStripeWebhook(db, svc, body, "t=1,v1=00", SECRET),
        ).toMatchObject({ status: 400 });
        const n = await db.superuser(
          async (c) =>
            (
              (
                await c.query(
                  "select count(*)::int n from billing.provider_events where event_id='evt_forged'",
                )
              ).rows[0] as { n: number }
            ).n,
        );
        expect(n).toBe(0);
      });

      it("only the billing service may apply provider events; a company owner cannot", async () => {
        await expect(
          db.rpc(
            ownerA,
            "select billing.apply_provider_event('stripe','evt_self','subscription.activated',$1,'tms_complete')",
            [a],
          ),
        ).rejects.toThrow(/only the billing service/);
      });

      it("an owner reads their own modules but not another company's", async () => {
        const mine = await db.rows<{ module: string; licensed: boolean }>(
          ownerB,
          "select * from entitlements.my_modules($1)",
          [b],
        );
        expect(mine.find((m) => m.module === "salon_booking")?.licensed).toBe(true);
        await expect(
          db.rows(ownerA, "select * from entitlements.my_modules($1)", [b]),
        ).rejects.toThrow(/not a member/);
        await expect(
          db.rpc(ownerA, "select entitlements.module_licensed($1,'tms_dvir')", [b]),
        ).rejects.toSatisfy((e: unknown) => isDbError(e) && e.code === "42501");
      });
    });

    describe("communications ledger, delivery and opt-out", () => {
      const phone = "+17165550100";
      const request = (owner: string, tenant: string, key: string) =>
        db.rpc<string>(
          owner,
          "select comms.request_message($1,'salonai','sms','appointment_reminder',1,$2,'transactional',$3,$4)",
          [
            tenant,
            phone,
            JSON.stringify({ service: "Cut and color", date: "Nov 12, 2:00 PM" }),
            key,
          ],
        );
      const status = (id: string) =>
        db.superuser(
          async (c) =>
            (
              await c.query(
                "select status::text s, attempts, next_attempt_at > now() later from comms.messages where id=$1",
                [id],
              )
            ).rows[0] as { s: string; attempts: number; later: boolean },
        );

      it("a queued reminder is delivered through the mock transport, rendered, once", async () => {
        const id = await request(ownerA, a, `k-${tag()}`);
        const t = new MockTransport();
        const rep = await deliverBatch(db, svc, { sms: t });
        expect(rep.sent).toBeGreaterThanOrEqual(1);
        expect(t.sent.find((m) => m.id === id)?.body).toBe(
          "Reminder: Cut and color on Nov 12, 2:00 PM. Reply STOP to opt out.",
        );
        expect((await status(id)).s).toBe("sent");
        expect((await deliverBatch(db, svc, { sms: t })).claimed).toBe(0); // nothing sent twice
      });

      it("the same idempotency key never creates a second message", async () => {
        const k = `k-${tag()}`;
        expect(await request(ownerA, a, k)).toBe(await request(ownerA, a, k));
        await deliverBatch(db, svc, { sms: new MockTransport() });
      });

      it("a temporary failure is retried later with backoff; a permanent one stops", async () => {
        const id = await request(ownerA, a, `k-${tag()}`);
        const flaky = new MockTransport();
        flaky.failNext = 1;
        expect((await deliverBatch(db, svc, { sms: flaky })).retried).toBe(1);
        expect(await status(id)).toMatchObject({
          s: "queued",
          attempts: 1,
          later: true,
        });
        const dead = await request(ownerA, a, `k-${tag()}`);
        const broken = new MockTransport();
        broken.failPermanently = true;
        await db.superuser((c) =>
          c.query("update comms.messages set next_attempt_at = now() where id = $1", [
            id,
          ]),
        );
        await deliverBatch(db, svc, { sms: broken });
        expect((await status(dead)).s).toBe("failed");
      });

      it("STOP needs a valid Twilio signature; a forged STOP is refused", async () => {
        const params = { From: phone, To: "+17165550199", Body: "STOP" };
        const url = "https://hlbos.example.test/sms/inbound";
        expect(
          await handleInboundSms(db, svc, {
            url,
            params,
            signature: "forged",
            authToken: "tok",
            tenantId: a,
          }),
        ).toBe("refused: bad signature");
        expect(
          await handleInboundSms(db, svc, {
            url,
            params,
            signature: twilioSignature(url, params, "tok"),
            authToken: "tok",
            tenantId: a,
          }),
        ).toBe("suppressed");
      });

      it("after STOP, new messages are suppressed and queued ones are stopped at send time — for that company only", async () => {
        expect((await status(await request(ownerA, a, `k-${tag()}`))).s).toBe(
          "suppressed",
        );
        const other = await request(ownerB, b, `k-${tag()}`); // same phone, different company
        expect((await status(other)).s).toBe("queued");
        // queued before STOP, sent after: caught at send time
        const c = await seedTenant(db, `c-${tag()}`, "C (synthetic)");
        const ownerC = await seedUser(db, `owner-c-${tag()}@example.test`);
        await seedMember(db, c, ownerC, "tenant_owner");
        const early = await request(ownerC, c, `k-${tag()}`);
        await db.rpc(svc, "select comms.apply_inbound_keyword($1,'sms',$2,'stop')", [
          c,
          phone,
        ]);
        await deliverBatch(db, svc, { sms: new MockTransport() });
        expect((await status(early)).s).toBe("suppressed");
      });

      it("START lifts the opt-out", async () => {
        const params = { From: phone, To: "+17165550199", Body: "START" };
        const url = "https://hlbos.example.test/sms/inbound";
        expect(
          await handleInboundSms(db, svc, {
            url,
            params,
            signature: twilioSignature(url, params, "tok"),
            authToken: "tok",
            tenantId: a,
          }),
        ).toBe("resubscribed");
        expect((await status(await request(ownerA, a, `k-${tag()}`))).s).toBe("queued");
        await deliverBatch(db, svc, { sms: new MockTransport() });
      });

      it("one company cannot flood the queue: the per-company limit defers the rest to the next run", async () => {
        for (let i = 0; i < 4; i++) await request(ownerB, b, `burst-${tag()}`);
        const rep = await deliverBatch(
          db,
          svc,
          { sms: new MockTransport() },
          { perTenantPerRun: 2 },
        );
        expect(rep.deferred).toBeGreaterThanOrEqual(2);
        const next = await deliverBatch(
          db,
          svc,
          { sms: new MockTransport() },
          { perTenantPerRun: 10 },
        );
        expect(next.sent).toBeGreaterThanOrEqual(2);
      });

      it("a company owner cannot run the delivery worker or forge a STOP", async () => {
        await expect(
          db.rows(ownerA, "select * from comms.claim_outbound(5)"),
        ).rejects.toThrow(/delivery worker/);
        await expect(
          db.rpc(ownerA, "select comms.apply_inbound_keyword($1,'sms',$2,'stop')", [
            b,
            phone,
          ]),
        ).rejects.toThrow(/inbound worker/);
      });
    });
  },
);
