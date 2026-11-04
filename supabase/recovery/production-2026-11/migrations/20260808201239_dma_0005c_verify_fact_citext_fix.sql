create or replace function dma.verify_fact(p_table text, p_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = 'dma','identity','public'
as $$
declare v_tenant uuid; v_perm text; v_new text;
begin
  if p_table not in ('clients','brands','offerings','markets','personas','competitors',
                     'objectives','channels','campaigns','assets','leads','recommendations') then
    raise exception 'verify_fact: table % is not verifiable', p_table using errcode='invalid_parameter_value';
  end if;
  v_perm := case p_table when 'clients' then 'dma.client.manage' when 'leads' then 'dma.lead.manage'
                         when 'recommendations' then 'dma.recommendation.manage' else 'dma.intelligence.manage' end;
  v_new := case p_decision when 'verify' then 'human_verified' when 'reject' then 'rejected'
                           when 'needs_review' then 'needs_review' when 'reset' then 'unverified' else null end;
  if v_new is null then
    raise exception 'verify_fact: decision must be verify|reject|needs_review|reset (got %)', p_decision using errcode='invalid_parameter_value';
  end if;
  execute format('select tenant_id from dma.%I where id=$1', p_table) into v_tenant using p_id;
  if v_tenant is null then raise exception 'verify_fact: % % not found', p_table, p_id using errcode='no_data_found'; end if;
  if not identity.has_permission(v_tenant, v_perm) then
    raise exception 'verify_fact: insufficient privilege' using errcode='insufficient_privilege';
  end if;
  execute format('update dma.%I set verification=$1::dma.verification, review_note=coalesce($2, review_note), updated_by=auth.uid() where id=$3', p_table)
    using v_new, p_note, p_id;
  return v_new;
end $$;
grant execute on function dma.verify_fact(text, uuid, text, text) to authenticated;