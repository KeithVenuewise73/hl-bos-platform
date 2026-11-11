# Redactions applied to the archived function sources

Each literal below was replaced in the committed copy with `<REDACTED:kind:sha256-prefix>`. The SHA-256 prefix is of the removed literal so a holder of the real value can confirm it matches; the value itself is not in this repository. Per-file hashes of the _unredacted_ deployed source are in `SHA256SUMS.original`; hashes of the committed (redacted) files are in `SHA256SUMS`.

| File                     | Kind                      | sha256[:12] of literal | Length |
| ------------------------ | ------------------------- | ---------------------- | ------ |
| `hlvs/index.ts`          | jwt                       | `e5e9a7d81b49`         | 208    |
| `discovery-run/index.ts` | hardcoded_key_literal     | `78e147b06346`         | 17     |
| `discovery-run/index.ts` | uuid_literal_named_tenant | `70595455ea9b`         | 36     |
