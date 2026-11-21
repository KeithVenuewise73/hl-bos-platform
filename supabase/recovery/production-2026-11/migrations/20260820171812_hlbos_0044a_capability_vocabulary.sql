insert into vstudio.capabilities (slug, label, cap_type, domain, description, hlg_vertical, engine_version)
values
  ('route-optimization', 'Route Optimization', 'functional', 'transportation', 'Plans and sequences multi-stop journeys under constraints such as vehicle capacity, time windows and driver availability.', 'supply_chain_logistics', '2026-08-20-v1'),
  ('fleet-management', 'Fleet Management', 'functional', 'transportation', 'Tracks vehicles, drivers and assets, including telematics, utilisation and maintenance.', 'supply_chain_logistics', '2026-08-20-v1'),
  ('inventory-warehouse', 'Inventory & Warehouse Management', 'functional', 'operations', 'Tracks stock levels, locations and movement through storage and fulfilment.', 'supply_chain_logistics', '2026-08-20-v1'),
  ('scheduling-dispatch', 'Scheduling & Dispatch', 'functional', 'operations', 'Assigns work, people or appointments to time slots and dispatches them to the field.', 'service_industry', '2026-08-20-v1'),
  ('crm-customer', 'Customer Relationship Management', 'business', 'commerce', 'Holds customer records, interactions and pipeline through the sales and service lifecycle.', 'business_transformation', '2026-08-20-v1'),
  ('billing-payments', 'Billing & Payments', 'business', 'commerce', 'Issues invoices, prices work and moves money, including subscriptions and payment processing.', 'business_transformation', '2026-08-20-v1'),
  ('workflow-automation', 'Workflow Automation', 'functional', 'automation', 'Runs multi-step business processes automatically, connecting triggers to actions across systems.', 'cross_vertical', '2026-08-20-v1'),
  ('system-integration', 'System Integration', 'technical', 'platform', 'Connects separate systems so data moves between them without manual re-entry.', 'cross_vertical', '2026-08-20-v1'),
  ('analytics-reporting', 'Analytics & Reporting', 'functional', 'analytics', 'Turns captured operational data into dashboards, reports and answerable questions.', 'cross_vertical', '2026-08-20-v1'),
  ('ai-agents', 'AI Agents & LLM Tooling', 'technical', 'ai', 'Builds, runs or orchestrates language-model agents, prompts and tool use.', 'hld_digital_services', '2026-08-20-v1'),
  ('document-processing', 'Document Processing', 'functional', 'automation', 'Extracts, converts or generates structured information from documents.', 'cross_vertical', '2026-08-20-v1'),
  ('communications-messaging', 'Communications & Messaging', 'functional', 'communications', 'Sends or routes messages between a business and its people or customers.', 'cross_vertical', '2026-08-20-v1'),
  ('sports-team-management', 'Sports & Team Management', 'functional', 'operations', 'Runs teams, leagues, fixtures, rosters and player or athlete performance.', 'sports', '2026-08-20-v1'),
  ('identity-access', 'Identity & Access Management', 'technical', 'identity', 'Authenticates people and decides what each of them is allowed to do.', 'cross_vertical', '2026-08-20-v1'),
  ('search-discovery', 'Search & Discovery', 'technical', 'discovery', 'Indexes content and retrieves it by relevance.', 'cross_vertical', '2026-08-20-v1'),
  ('monitoring-observability', 'Monitoring & Observability', 'technical', 'platform', 'Watches running systems and reports when something is wrong.', 'hld_digital_services', '2026-08-20-v1'),
  ('content-management', 'Content Management', 'functional', 'marketing', 'Authors, stores and publishes web or product content.', 'hld_digital_services', '2026-08-20-v1'),
  ('project-collaboration', 'Project & Collaboration Management', 'functional', 'operations', 'Coordinates work, tasks and documents across a group of people.', 'business_transformation', '2026-08-20-v1')
on conflict (slug) do update set
  label = excluded.label, cap_type = excluded.cap_type, domain = excluded.domain,
  description = excluded.description, hlg_vertical = excluded.hlg_vertical,
  engine_version = excluded.engine_version;
create or replace function vstudio.extract_capability_categories()
returns table (category text)
language sql stable security definer set search_path = '' as $fn$
  select distinct o.category from vstudio.opportunities o order by 1
$fn$;
revoke all on function vstudio.extract_capability_categories() from public, anon;
grant execute on function vstudio.extract_capability_categories() to authenticated;