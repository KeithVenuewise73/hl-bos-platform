do $$ begin create type barberos.blocker_owner as enum ('ceo','engineering');
  exception when duplicate_object then null; end $$;

alter table barberos.capabilities
  add column if not exists blocked_on    text,
  add column if not exists blocker_owner barberos.blocker_owner;

comment on column barberos.capabilities.blocked_on is
  'What this module is waiting on, in plain words. NULL for anything shipped, and for a module waiting only on its turn.';
comment on column barberos.capabilities.blocker_owner is
  'Who can clear it: ''ceo'' for an account or credential -- a decision about trust -- and ''engineering'' for work.';

alter table barberos.capabilities
  drop constraint if exists capabilities_available_is_unblocked;
alter table barberos.capabilities
  add constraint capabilities_available_is_unblocked
  check (status <> 'available' or blocked_on is null);

alter table barberos.capabilities
  drop constraint if exists capabilities_blocker_has_owner;
alter table barberos.capabilities
  add constraint capabilities_blocker_has_owner
  check ((blocked_on is null) = (blocker_owner is null));

insert into barberos.capabilities
  (key, name, category, description, status, is_default, locked_config_keys,
   blocked_on, blocker_owner) values
  ('local_seo', 'Local SEO Engine', 'presence',
   'Ranking for "barber near me", the town name and each service, and in Google Maps. Structured data, service and area pages, and the technical work on the shop''s own site.',
   'planned', false, '{}',
   'A Google Search Console property for the shop''s domain, and a Places/Maps API key on the agency account.', 'ceo'),

  ('google_business', 'Google Business Engine', 'presence',
   'The shop''s Google Business Profile as an operated asset: posts, photos, Q&A, categories and services, plus monitoring of where it ranks over time.',
   'planned', false, '{}',
   'Google Business Profile API access (an approved project) and the shop granting manager rights on their listing.', 'ceo'),

  ('lead_funnel', 'Lead Funnel', 'growth',
   'Turns a visitor into a booked appointment: the path from the page to a held slot, and the measurement of where people fall out of it.',
   'planned', false, '{}',
   'Booking, which it converts into. Engineering only.', 'engineering'),

  ('retention_engine', 'Retention Engine', 'growth',
   'Notices a regular is overdue against their own rhythm and asks them back. Built on the visit history, so it measures the client rather than a fixed interval.',
   'planned', false, '{}',
   'A way to send a message -- the same SMS/email provider the marketing engine needs.', 'ceo'),

  ('marketing_engine', 'Marketing Engine', 'growth',
   'SMS and email to the shop''s own clients: offers, promotions, birthdays and win-backs, sent from the CRM rather than a separate list.',
   'planned', false, '{}',
   'An SMS provider account with a number, and an email sending domain. Both are billable and both are the shop''s or the agency''s to open.', 'ceo'),

  ('social_engine', 'Social Engine', 'growth',
   'Instagram, TikTok and Facebook content generated from what the shop already produces -- cuts, reviews, promotions and staff. The platform''s publishing layer already exists; this is the barbershop''s use of it.',
   'planned', false, '{}',
   'The Meta app with Instagram and Facebook Login, a TikTok app, and each account connected -- the six-step access list already recorded as a blocker on this platform.', 'ceo'),

  ('ai_advisor', 'AI Business Advisor', 'insight',
   'Tells the owner what to do next, from their own numbers. Deliberately last: an advisor with no revenue, booking or retention data to read would be an opinion generator.',
   'planned', false, '{}',
   'The modules it reads from. Engineering only, and not before them.', 'engineering')
on conflict (key) do nothing;

update barberos.capabilities set
  blocked_on = 'Nothing but its turn. No account, no credential, no third party -- and it is the record every other module hangs off.',
  blocker_owner = 'engineering', version = version + 1
 where key = 'client_crm';

update barberos.capabilities set
  blocked_on = 'Engineering only.', blocker_owner = 'engineering', version = version + 1
 where key in ('booking','walkin_queue','staff_management');

update barberos.capabilities set
  blocked_on = 'A phone number and a telephony provider account, so a missed call can be texted back.',
  blocker_owner = 'ceo', version = version + 1
 where key = 'missed_call_capture';

update barberos.capabilities set
  name = 'Reputation Engine',
  description = 'Asks EVERY customer for a public review -- timing is the only variable -- and gives a customer who reports a problem privately a service-recovery workflow. It does not and will not gate: asking only the happy ones is against Google''s review policies and is review suppression under FTC guidance, and the config keys that would switch it on are locked at the schema.',
  blocked_on = 'A way to send the request (SMS or email) and the shop''s Google review link.',
  blocker_owner = 'ceo', version = version + 1
 where key = 'review_engine';

update barberos.capabilities set
  name = 'Revenue Intelligence',
  description = 'Revenue per customer and per chair, utilisation, cancellations, repeat rate and service mix. Read-only, and only ever over figures the platform actually holds.',
  blocked_on = 'The modules that produce the numbers. Engineering only, and honest only once they exist.',
  blocker_owner = 'engineering', version = version + 1
 where key = 'reporting_dashboard';

insert into barberos.capability_requires (capability_key, requires_key, reason) values
  ('local_seo',        'owned_website', 'You cannot do the technical work on a page the shop does not own.'),
  ('lead_funnel',      'booking',       'A funnel with nothing to book into is a page with a button.'),
  ('retention_engine', 'client_crm',    'Overdue is measured against a client''s own visit history.'),
  ('marketing_engine', 'client_crm',    'A campaign is sent to the shop''s clients, not to a bought list.'),
  ('ai_advisor',       'reporting_dashboard', 'Advice with no numbers behind it is an opinion.')
on conflict do nothing;