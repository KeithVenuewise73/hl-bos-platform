-- Product-scoped intelligence (CEO-approved). Additive, backward-compatible:
-- offering_id NULL = client-level (unchanged); set = product-scoped.
do $$
declare t text;
begin
  foreach t in array array['personas','objectives','campaigns','channels',
                           'assets','leads','metrics','recommendations']
  loop
    execute format('alter table dma.%I add column if not exists offering_id uuid references dma.offerings(id) on delete set null', t);
    execute format('create index if not exists %I on dma.%I (offering_id)', t||'_offering_idx', t);
  end loop;
end $$;