-- hlbos_0040: a tab is not a source URL
--
-- vstudio.pain_signals guards its evidence link with:
--
--     check (length(btrim(source_url)) > 0)
--
-- The intent was "a pain signal must carry a URL somebody can open". The
-- implementation does not do that. Single-argument btrim() strips SPACES and
-- nothing else -- not tabs, not newlines, not carriage returns. So:
--
--     select length(btrim(E'\t \n'));  -->  3
--
-- A source_url of a tab and a newline therefore satisfies the constraint. The
-- whole public-pain claim rests on every complaint being traceable back to the
-- place it was made, and this guard let untraceable ones through. A pgTAP
-- assertion caught it; it had been wrong since the table was created in 0033.
--
-- No stored row violates the stricter rule -- all 439 production signals carry
-- a real https URL -- so this tightens the guard without touching data.
--
-- DROP CONSTRAINT below removes a CHECK, not a table, schema or column. No
-- data is deleted by it and none can be.
--
-- rollback:
--   alter table vstudio.pain_signals
--     drop constraint pain_signals_source_url_present;
--   alter table vstudio.pain_signals
--     add constraint pain_signals_source_url_check
--     check (length(btrim(source_url)) > 0);

alter table vstudio.pain_signals
  drop constraint if exists pain_signals_source_url_check;

alter table vstudio.pain_signals
  add constraint pain_signals_source_url_present
  check (btrim(source_url, E' \t\r\n\f\v') <> '');

comment on constraint pain_signals_source_url_present on vstudio.pain_signals is
  'A pain signal must name a location a human can open. Trims every ASCII whitespace character, not just the space that single-argument btrim() handles.';
