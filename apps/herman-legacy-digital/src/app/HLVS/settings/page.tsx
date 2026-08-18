import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Badge, Row, colors } from "@/hlvs/components/ui";
import { DISCOVERY_SOURCES } from "@hl-bos/venture-studio";

export default function Settings() {
  return (
    <StudioShell view="settings">
      <h1 style={{ fontSize: 20 }}>Sources & Settings</h1>
      <p style={{ color: colors.dim, fontSize: 13 }}>
        V2-1 has no external connectors. Every source is <strong>not connected</strong>{" "}
        and produces no data — honestly. Connectors arrive in V2-2.
      </p>
      <Card
        title="Discovery sources"
        sub="13 planned sources · all not connected in V2-1"
      >
        {DISCOVERY_SOURCES.map((s) => (
          <Row
            key={s.key}
            k={`${s.name}  ·  ${s.posture}`}
            v={
              <span style={{ display: "flex", gap: 6 }}>
                <Badge
                  tone={
                    s.tier === "sensitive"
                      ? "bad"
                      : s.tier === "auth"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {s.tier}
                </Badge>
                <Badge tone="neutral">not connected</Badge>
              </span>
            }
          />
        ))}
      </Card>
    </StudioShell>
  );
}
