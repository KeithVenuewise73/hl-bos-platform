alter function dma._attach_triggers(regclass) set search_path = '';
alter function dma.enforce_recommendation_gate() set search_path = '';
revoke all on function dma._attach_triggers(regclass) from public;
revoke all on function dma.enforce_recommendation_gate() from public;