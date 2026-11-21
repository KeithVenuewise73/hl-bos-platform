alter table jobscout.runtime
  add column if not exists view_token text not null
    default encode(extensions.gen_random_bytes(24), 'hex');