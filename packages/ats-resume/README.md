# @hl-bos/ats-resume

The engine behind the ATS Resume Optimizer.

**Optimize aggressively. Fabricate nothing.**

This package is pure TypeScript: no database, no filesystem, no environment variables, no network unless you hand it an AI provider. That is what makes it testable, and it is why the app on top of it is thin.

---

## The idea

A resume tailoring tool has one way to fail badly. Not a wrong score, not an awkward sentence — **putting a claim on someone's resume that is not true.** That claim gets sent to an employer under their name, and they get asked about it in a room.

So the whole package is arranged around one boundary:

| Side        | What it is                                            | Where it lives                                       |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------- |
| **Facts**   | What the resume says, and what the user has confirmed | `CareerFact`, `source: "resume" \| "user_confirmed"` |
| **Wording** | What we generate                                      | `GeneratedLine`, always carries its evidence         |

`validateClaim()` sits on that boundary, and `buildExportDocument()` refuses to write anything that has not crossed it. Not a UI badge — the function that produces the bytes.

---

## Pipeline

```
extractResumeText  ─▶ parseResume     ─▶ factsFromResume ─┐
                                                          ├─▶ analyzeJob ─▶ generateTailoredResume
parseJobPosting ──────────────────────────────────────────┘                          │
                                                                                     ▼
                                                                    buildExportDocument ─▶ DOCX / PDF / text
```

Each stage consumes the previous stage's output as data. Nothing reaches back into the raw text to "check again", so the same resume and the same posting always produce the same matrix and the same score.

---

## The ten services

| Service                | Module                                 | Implementation                              |
| ---------------------- | -------------------------------------- | ------------------------------------------- |
| ResumeParser           | `resume-parser.ts`                     | deterministic                               |
| JobPostingParser       | `job-parser.ts`                        | deterministic                               |
| RequirementExtractor   | `job-parser.ts` + `provider/claude.ts` | deterministic, optionally refined by Claude |
| EvidenceMatcher        | `evidence.ts`                          | deterministic                               |
| KeywordAnalyzer        | `keywords.ts`                          | deterministic                               |
| ResumeOptimizer        | `optimizer.ts` + `provider/claude.ts`  | deterministic, optionally refined by Claude |
| CoverLetterGenerator   | `cover-letter.ts`                      | deterministic                               |
| InterviewPrepGenerator | `interview-prep.ts`                    | deterministic                               |
| ClaimValidator         | `claims.ts`                            | deterministic                               |
| ATSFormatValidator     | `ats-format.ts`                        | deterministic                               |

**The rules engine is the product, not a fallback.** With no API key, every feature works: parsing, matching, scoring, generation, export. Claude improves two things — reading a badly written posting, and phrasing a bullet — and every suggestion it makes is re-checked by the same validator as everything else (`applyRewriteProposals`). A model cannot argue its way past that check, because the check reads the sentence, not the explanation.

---

## Match statuses

| Status                | Meaning                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| **Strong match**      | The candidate's own words cover the requirement.                                 |
| **Terminology match** | They have done the work; the posting words it differently. A rewrite is offered. |
| **Partial match**     | Some of the requirement is evidenced, not all of it.                             |
| **Not evidenced**     | Nothing in the profile supports it. It stays out of the resume.                  |

### Terminology vs adjacency

`TERMINOLOGY_GROUPS` (in `vocabulary.ts`) map "the posting says X, the resume says Y, and they are the same work". A rewrite fires only when **both** sides are present.

`ADJACENT_CONCEPTS` is the other half, and it matters more. These are pairs where the candidate has done something _near_ the requirement and relabelling would quietly upgrade the claim:

- an **$18M operating budget** is not **P&L ownership** — a P&L has a revenue line
- **process improvement** is not a **Lean Six Sigma certification**
- **"supported"** is not **"owned"**
- general safety work is not **DOT/FMCSA compliance**

An adjacent hit produces a partial match carrying the specific warning, never a rewrite. The P&L case is in this list because an earlier version of this code cheerfully rewrote one into the other.

---

## Scoring

Weights are the product owner's, and `SCORE_WEIGHTS` is the single place they live:

| Category                     | Weight |
| ---------------------------- | ------ |
| Qualification alignment      | 35     |
| Relevant experience          | 25     |
| Skills and keyword coverage  | 20     |
| Quantified accomplishments   | 10     |
| ATS structure and formatting | 10     |

Two scores are produced: the resume as it stands, and a projection after every **supported** revision. The projection gives zero credit to unevidenced requirements — it is a promise the tool can keep.

`SCORE_DISCLAIMER` is exported so every surface can state the same thing: this is our measure, not the employer's ATS score, and it predicts nothing about the outcome.

---

## Documents

DOCX and PDF are generated from scratch, with no document library:

- `export/zip.ts` — a ZIP writer and reader (a `.docx` is a zip of XML). Deflate comes from Node's `zlib`.
- `export/docx.ts` — deliberately the most boring Word document possible: one column, one font, standard headings, literal bullet characters, no tables, text boxes, images, headers or footers.
- `export/pdf.ts` — uncompressed content streams with the base-14 Helvetica fonts, so the text in the file **is text**. Line breaking uses the real Adobe metrics.
- `extract.ts` — reads DOCX and PDF back. DOCX is reliable; PDF is best effort and says so, with `assessExtraction()` grading the result rather than letting a mangled resume flow silently into an analysis.

The round trip is tested: what we write, we can read back.

---

## Usage

```ts
import {
  analyzeJob,
  buildDemoDataset,
  buildExportDocument,
  factsFromResume,
  generateTailoredResume,
  parseJobPosting,
  parseResume,
  renderDocx,
} from "@hl-bos/ats-resume";

const parsed = parseResume(resumeText);
const facts = factsFromResume(profileId, parsed);
const job = { /* … */ ...parseJobPosting({ rawText: postingText }) };

const analysis = analyzeJob({ profileId, resume, facts, job });
const tailored = generateTailoredResume({ profile, resume, facts, job, analysis });

const { document, dropped } = buildExportDocument(tailored);
// `dropped` is every claim that did not clear the validator. It is never silent.
const docx = renderDocx(document);
```

`buildDemoDataset()` returns a complete, working dataset for a fictional transportation executive. Every record it creates is marked `isSample: true`.

---

## Tests

```bash
pnpm --filter @hl-bos/ats-resume test
```

76 tests. The ones that matter most are the guardrail tests in `claims.test.ts` and the end-to-end properties in `pipeline.test.ts`:

- no generated line contains a number its evidence does not contain
- every generated line has evidence attached
- an unsupported line is dropped from the export and reported
- what the screen shows and what the file contains are the same
- the cover letter contains no invented enthusiasm

Several of these exist because they caught a real defect. The comments say which.
