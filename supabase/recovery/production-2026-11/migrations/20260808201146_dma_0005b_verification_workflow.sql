do $$
declare t text;
begin
  foreach t in array array['clients','brands','offerings','markets','personas','competitors',
                           'objectives','channels','campaigns','assets','leads','recommendations']
  loop
    execute format('alter table dma.%I add column if not exists verified_by uuid', t);
    execute format('alter table dma.%I add column if not exists verified_at timestamptz', t);
    execute format('alter table dma.%I add column if not exists review_note text', t);
  end loop;
end $$;

create or replace function dma.stamp_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.verification is distinct from old.verification then
    if new.verification in ('human_verified','rejected','corrected') then
      new.verified_by := coalesce(new.verified_by, auth.uid());
      new.verified_at := now();
    elsif new.verification in ('unverified','needs_review') then
      new.verified_by := null;
      new.verified_at := null;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients','brands','offerings','markets','personas','competitors',
                           'objectives','channels','campaigns','assets','leads','recommendations']
  loop
    execute format('drop trigger if exists %I on dma.%I', t||'_stamp_verification', t);
    execute format('create trigger %I before update on dma.%I for each row execute function dma.stamp_verification()',
                   t||'_stamp_verification', t);
  end loop;
end $$;

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
  if not identity.has_permission(v_tenant, v_perm::citext) then
    raise exception 'verify_fact: insufficient privilege' using errcode='insufficient_privilege';
  end if;
  execute format('update dma.%I set verification=$1::dma.verification, review_note=coalesce($2, review_note), updated_by=auth.uid() where id=$3', p_table)
    using v_new, p_note, p_id;
  return v_new;
end $$;
grant execute on function dma.verify_fact(text, uuid, text, text) to authenticated;

create or replace function dma.client_fact_stats(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = 'dma','identity','public'
as $$
declare v_tenant uuid; v_result jsonb;
begin
  select tenant_id into v_tenant from dma.clients where id = p_client;
  if v_tenant is null then raise exception 'client % not found', p_client using errcode='no_data_found'; end if;
  if not identity.has_permission(v_tenant, 'dma.client.read') then
    raise exception 'insufficient privilege' using errcode='insufficient_privilege';
  end if;
  with facts as (
    select provenance::text as provenance, verification::text as verification from dma.clients where id=p_client
    union all select provenance::text, verification::text from dma.brands where client_id=p_client and status='active'
    union all select provenance::text, verification::text from dma.offerings where client_id=p_client and status='active'
    union all select provenance::text, verification::text from dma.markets where client_id=p_client and status='active'
    union all select provenance::text, verification::text from dma.personas where client_id=p_client and status='active'
    union all select provenance::text, verification::text from dma.competitors where client_id=p_client and status='active'
    union all select provenance::text, verification::text from dma.objectives where client_id=p_client and status <> 'abandoned'
    union all select provenance::text, verification::text from dma.channels where client_id=p_client and status='active'
  ),
  agg as (
    select count(*)::int as total,
           count(*) filter (where verification='human_verified')::int as verified,
           count(*) filter (where verification='needs_review')::int as needs_review,
           count(*) filter (where verification='rejected')::int as rejected,
           count(*) filter (where verification='corrected')::int as corrected,
           count(*) filter (where provenance='ai_inferred')::int as ai_inferred,
           count(*) filter (where provenance='human_entered' and verification='unverified')::int as human_unverified
    from facts
  )
  select jsonb_build_object(
    'total', total, 'verified', verified, 'needs_review', needs_review, 'rejected', rejected,
    'corrected', corrected, 'ai_inferred', ai_inferred, 'human_unverified', human_unverified,
    'verified_pct', case when total>0 then round(verified*100.0/total)::int else 0 end,
    'needs_review_pct', case when total>0 then round(needs_review*100.0/total)::int else 0 end
  ) into v_result from agg;
  return v_result;
end $$;
grant execute on function dma.client_fact_stats(uuid) to authenticated;