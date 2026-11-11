do $$
declare
  v_owner uuid := 'c9827bd9-1614-4c51-bd25-762d3ae0cac0';
  v_vw    uuid := (select c.id from dma.clients c
                     join platform.tenants t on t.id=c.tenant_id
                    where t.slug='herman-legacy-digital' and c.slug='venuewise');
  v_ten   uuid := (select id from platform.tenants where slug='herman-legacy-digital');
begin
  if v_vw is null then raise exception 'Venuewise client not found'; end if;
  insert into dma.offerings (tenant_id, client_id, kind, name, summary, is_core, provenance, verification, created_by)
  select v_ten, v_vw, 'product', 'HomeHuddle',
         'Family scheduling product; intended first real-world DMA-OS customer-acquisition proving ground.',
         true, 'human_entered', 'needs_review', v_owner
  where not exists (select 1 from dma.offerings o where o.client_id=v_vw and o.name='HomeHuddle');
  insert into dma.objectives (tenant_id, client_id, title, objective_type, priority, status, provenance, verification, created_by)
  select v_ten, v_vw, 'Acquire paying HomeHuddle family subscriptions', 'subscriptions', 'primary', 'proposed',
         'human_entered', 'needs_review', v_owner
  where not exists (select 1 from dma.objectives o where o.client_id=v_vw and o.title='Acquire paying HomeHuddle family subscriptions');
end $$;