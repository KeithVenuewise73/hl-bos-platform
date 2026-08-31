import { vocabularyState } from "@/lib/vocabulary";
import { Card, Empty } from "@/components/ui";
import { GroupTable } from "@/components/VocabularyUI";

export const dynamic = "force-dynamic";

/**
 * Every word AI Persona X puts on a screen, and every phrase it sends an image
 * model, in one page — so reviewing the product's own copy never requires
 * opening a source file.
 *
 * It renders nothing it cannot read. When the product's checkout is not on this
 * machine the page says exactly that, lists everywhere it looked, and stops.
 */
export default async function VocabularyPage() {
  const state = await vocabularyState();

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Vocabulary</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          {state.found ? state.doc.product : "AI Persona X"} — every choice a customer
          can make, and the exact words each one sends an image model.{" "}
          <a href="/" style={{ color: "#58a6ff" }}>
            Back to the console
          </a>
        </p>
      </header>

      {!state.found ? (
        <Card title="Nothing to show" sub="And here is why, rather than an empty page.">
          <Empty>
            {state.reason}
            <br />
            <br />
            Looked for:
            {state.searched.map((p) => (
              <span
                key={p}
                style={{
                  display: "block",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  color: "#6e7681",
                  marginTop: 4,
                }}
              >
                {p}
              </span>
            ))}
          </Empty>
        </Card>
      ) : (
        <>
          <Card
            title="Where this comes from"
            sub="Read live from the product's own repository, never copied into this one."
          >
            <Empty>
              {state.totals.lists} lists · {state.totals.choices} choices ·{" "}
              {state.totals.rules} rules.
              {state.revision ? (
                <>
                  {" "}
                  Last changed in commit{" "}
                  <code style={{ color: "#c9d1d9" }}>
                    {state.revision.hash}
                  </code> on {state.revision.date}.
                </>
              ) : (
                " This console could not ask git when it last changed."
              )}
              <br />
              <br />
              These lists are the allow-list: a value that is not here cannot be stored.
              If a phrase below is wrong, the picture is wrong — that is the text an
              image model actually receives.
              <span
                style={{
                  display: "block",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  color: "#6e7681",
                  marginTop: 10,
                }}
              >
                {state.repoPath}
              </span>
            </Empty>
          </Card>

          <Card
            title="The rules behind the lists"
            sub="Behaviour a list cannot show on its own. Each one is enforced in code and covered by a test."
          >
            {state.doc.rules.map((rule) => (
              <div
                key={rule.title}
                style={{ padding: "10px 0", borderBottom: "1px solid #1c2128" }}
              >
                <strong style={{ fontSize: 13.5 }}>{rule.title}</strong>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 12.5,
                    color: "#8b949e",
                    lineHeight: 1.65,
                    maxWidth: 860,
                  }}
                >
                  {rule.detail}
                </p>
              </div>
            ))}
          </Card>

          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              margin: "0 0 18px",
            }}
          >
            {state.doc.sections.map((section) => (
              <a
                key={section.key}
                href={`#${section.key}`}
                style={{
                  fontSize: 12.5,
                  color: "#58a6ff",
                  background: "#12151a",
                  border: "1px solid #262c36",
                  borderRadius: 999,
                  padding: "5px 12px",
                  textDecoration: "none",
                }}
              >
                {section.label}
              </a>
            ))}
          </nav>

          {state.doc.sections.map((section) => (
            <div key={section.key} id={section.key} style={{ scrollMarginTop: 16 }}>
              <Card title={section.label} sub={section.description}>
                {section.groups.map((group) => (
                  <GroupTable key={group.key} group={group} />
                ))}
              </Card>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
