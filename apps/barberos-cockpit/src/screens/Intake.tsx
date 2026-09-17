"use client";

import { useState } from "react";

import { importShop, type Agency, type ShopImport } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { Card, Field } from "@/components/ui";
import { Crumbs, PageHead, Toast } from "@/components/parts";

/**
 * Screen 2 — prospect intake.
 *
 * Delegates entirely to barberos_audit_import_shop, which dedupes on
 * lower(name)|lower(postcode) and updates the existing prospect instead of
 * creating a second one. So re-entering a shop is safe, and the operator is
 * told which of the two happened rather than being left to guess.
 */
export default function Intake({
  agency,
  onSaved,
  onBack,
}: {
  agency: Agency;
  onSaved: (prospectId: string) => void;
  onBack: () => void;
}) {
  const [f, setF] = useState<ShopImport>({ business_name: "" });
  const act = useAction();

  function set<K extends keyof ShopImport>(k: K, v: ShopImport[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function save() {
    const row: ShopImport = {
      business_name: f.business_name.trim(),
      ...(f.phone?.trim() ? { phone: f.phone.trim() } : {}),
      ...(f.address_line1?.trim() ? { address_line1: f.address_line1.trim() } : {}),
      ...(f.locality?.trim() ? { locality: f.locality.trim() } : {}),
      ...(f.region?.trim() ? { region: f.region.trim() } : {}),
      ...(f.postal_code?.trim() ? { postal_code: f.postal_code.trim() } : {}),
      ...(f.website_url?.trim() ? { website_url: f.website_url.trim() } : {}),
      ...(f.gbp_url?.trim() ? { gbp_url: f.gbp_url.trim() } : {}),
      ...(f.instagram_url?.trim() ? { instagram_url: f.instagram_url.trim() } : {}),
      source_file: "cockpit-manual-entry",
    };
    let id = "";
    act.run(
      "Shop saved.",
      () => importShop(agency.tenant_id, row).then((v) => (id = v)),
      () => {
        if (id) onSaved(id);
      },
    );
  }

  return (
    <>
      <Crumbs trail={[{ label: "Pipeline", go: onBack }, { label: "Add a shop" }]} />
      <PageHead
        title="Add a shop"
        sub="Only the name is required. Everything else is what you actually know — leave a field blank rather than guessing at it, because an audit run will later report what it could and could not reach."
      />

      <Card title="The shop">
        <div className="grid cols-2">
          <Field label="Business name (required)">
            <input
              type="text"
              value={f.business_name}
              onChange={(e) => set("business_name", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={f.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Street">
            <input
              type="text"
              value={f.address_line1 ?? ""}
              onChange={(e) => set("address_line1", e.target.value)}
            />
          </Field>
          <Field label="Town">
            <input
              type="text"
              value={f.locality ?? ""}
              onChange={(e) => set("locality", e.target.value)}
            />
          </Field>
          <Field label="State / region">
            <input
              type="text"
              value={f.region ?? ""}
              onChange={(e) => set("region", e.target.value)}
            />
          </Field>
          <Field label="Postcode (used for de-duplication)">
            <input
              type="text"
              value={f.postal_code ?? ""}
              onChange={(e) => set("postal_code", e.target.value)}
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              placeholder="https://"
              value={f.website_url ?? ""}
              onChange={(e) => set("website_url", e.target.value)}
            />
          </Field>
          <Field label="Google Business profile URL">
            <input
              type="url"
              placeholder="https://"
              value={f.gbp_url ?? ""}
              onChange={(e) => set("gbp_url", e.target.value)}
            />
          </Field>
          <Field label="Instagram">
            <input
              type="url"
              placeholder="https://"
              value={f.instagram_url ?? ""}
              onChange={(e) => set("instagram_url", e.target.value)}
            />
          </Field>
        </div>

        <div className="banner" style={{ marginTop: 6 }}>
          If this shop is already on the list under the same name and postcode, saving
          updates that record rather than creating a second one.
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn primary"
            disabled={act.busy || f.business_name.trim().length === 0}
            onClick={save}
          >
            {act.busy ? "Saving…" : "Save shop"}
          </button>
          <button className="btn" onClick={onBack}>
            Cancel
          </button>
        </div>
      </Card>

      <Toast notice={act.notice} onClose={act.clear} />
    </>
  );
}
