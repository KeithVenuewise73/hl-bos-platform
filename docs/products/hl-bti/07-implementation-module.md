# HL-BTI — Implementation Module (Deliverable 7)

After a proposal is accepted, HL-BTI manages the **consulting implementation** — projects, milestones, tasks, progress — and tracks **ROI**. This is a genuinely new capability: `provisioning.work_orders` model **software provisioning** of HL-BOS modules, a different concern from managing a consulting engagement's delivery.

## 1. Delivery model

`bti.projects` → `bti.milestones` → `bti.tasks`, all tenant-scoped, RLS+FORCE, audited.

- `bti.create_project(engagement, name)` — **refuses `analysis_only` engagements** (Venuewise has no delivery). Requires `bti.delivery.manage`.
- `bti.add_milestone(project, name, sequence, due)`
- `bti.add_task(milestone, title, sequence, assignee)`
- `bti.set_task_status(task, status)` — status ∈ `todo | in_progress | blocked | done | cancelled`.

The Deno-independent DB test drives the full chain (project → milestone → task → done) and asserts the task reaches `done`.

## 2. ROI tracking

`bti.roi_metrics` records **baseline → projected → realized** per engagement.

- `bti.record_roi_metric(engagement, label, unit, baseline, projected, note)` — status becomes `projected` when a projection is given, else `baseline`. **Refuses `analysis_only`** engagements.
- `bti.realize_roi_metric(metric, realized)` — sets `realized_value`, status `realized`, stamps `captured_at`.

Honest by design: `realized_value` is only ever what was actually recorded — never inferred from the projection. The test drives record → realize and asserts `status = realized`, `realized_value = 290`.

## 3. Customer portal / dashboards (PCO)

The PCO lists Customer Portal, Executive Dashboard and ROI Dashboard. Their **data foundation is complete**: projects/milestones/tasks (progress), `executive_scores` (executive dashboard), and `roi_metrics` (ROI dashboard) are all queryable, permission-gated read models. A customer-facing UI is a separate front-end deliverable; per the honesty rule, no portal screen is claimed until it is built and shown to work. The read models it will bind to exist and are tested.

## 4. Lifecycle coupling

Implementation lives in the `implementation` / `project_management` / `roi_tracking` stages of the engagement lifecycle. The stage machine and the delivery/ROI RPCs both enforce the analysis-only cap, so the "advise only" boundary holds whether reached via the lifecycle or via a direct RPC call.
