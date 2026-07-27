# CP8 · Deliverable 16 — Factory-Interface Event Catalog

**Date:** 2026-07-27 · **Checkpoint:** 8 · Reuses the existing `events` bus + CP5 shared dispatcher. **No second event bus.**

All events are emitted via `events.emit` (platform-level, `tenant_id = null`) and delivered through the CP5 shared dispatcher. The inert `hlvs_factory_worker` subscribes to `hlvs.software_creation_order.approved`.

## HLVS → HL-BOS

| Event                                    | Emitted by                             |
| ---------------------------------------- | -------------------------------------- |
| `hlvs.software_creation_order.approved`  | `approve_software_creation_order`      |
| `hlvs.prompt_package.generated`          | `generate_prompt_package`              |
| `hlvs.development_run.started`           | `start_development_run`                |
| `hlvs.checkpoint_report.submitted`       | `submit_checkpoint_report`             |
| `hlvs.checkpoint_report.accepted`        | `review_checkpoint_report` (on accept) |
| `hlvs.build_completion_report.submitted` | `submit_build_completion_report`       |
| `hlvs.blueprint_conformance.completed`   | `run_conformance`                      |
| `hlvs.catalog_update.approved`           | `approve_catalog_update_proposal`      |
| `hlvs.factory_build_package.submitted`   | `submit_factory_package`               |
| `hlvs.product_blueprint.approved`        | `approve_product_blueprint`            |

## HL-BOS → HLVS

| Event                                  | Emitted by                     |
| -------------------------------------- | ------------------------------ |
| `hlbos.factory_build_package.received` | `submit_factory_package`       |
| `hlbos.factory_build_package.accepted` | `hlbos_intake_review` (accept) |
| `hlbos.factory_build_package.rejected` | `hlbos_intake_review` (reject) |
| `hlbos.production_review.ready`        | `hlbos_intake_review` (accept) |
| `hlbos.production_review.blocked`      | `hlbos_intake_review` (reject) |

## Versioning + no duplication

Topics use the existing outbox format (`^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$`) and the existing dispatcher. Emission is proven for every topic in `27_hlvs_factory.sql` (`t_event_*`); the worker subscription + handler exist on the shared bus (`t_worker_subscription`, `t_worker_handler`). No second event bus or worker framework was created.
