-- Phase 4A: Dr. Pill. Conversations, messages, agent activity log, agent rules.
--
--  * Patients chat anonymously on a public page; the SERVER (service role) creates conversations and
--    messages and checks a random per-conversation token (only its SHA-256 hash is stored, and the hash
--    column is not readable by any client).
--  * Staff (owner, receptionist) read conversations and activity, reply as "staff", and hand a
--    conversation back to Dr. Pill. Clients cannot create conversations or agent_actions.
--  * agent_actions is the single log of what Dr. Pill did (no patient names or contact details in payload).

create type public.conversation_status as enum ('open', 'needs_human', 'resolved');
create type public.agent_action_status as enum ('proposed', 'approved', 'executed', 'rejected', 'failed');
create type public.autonomy_level as enum ('suggest', 'approve', 'auto');

-- Public identifier for the clinic's chat link (not a secret; it only selects the clinic).
alter table public.clinics add column chat_slug text unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12);
update public.clinics set chat_slug = substr(md5(random()::text || id::text), 1, 12) where chat_slug is null;
alter table public.clinics alter column chat_slug set not null;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid,
  channel text not null default 'web' check (channel in ('web', 'messenger', 'viber', 'sms', 'email')),
  status public.conversation_status not null default 'open',
  handled_by text not null default 'ai' check (handled_by in ('ai', 'human')),
  handoff_reason text check (handoff_reason in ('medical', 'refund', 'upset', 'requested', 'booking', 'other')),
  handoff_summary text check (char_length(handoff_summary) <= 500),
  token_hash text not null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
);
create index conversations_inbox_idx on public.conversations (clinic_id, status, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  conversation_id uuid not null,
  role text not null check (role in ('patient', 'assistant', 'staff', 'system')),
  handled_by text check (handled_by in ('ai', 'human')),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (clinic_id, conversation_id) references public.conversations (clinic_id, id) on delete cascade
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind text not null check (char_length(kind) between 1 and 60),
  status public.agent_action_status not null default 'executed',
  autonomy public.autonomy_level not null default 'auto',
  -- Ids and non-personal facts only. Never patient names, phone numbers or message text.
  payload jsonb not null default '{}'::jsonb,
  outcome text check (char_length(outcome) <= 200),
  recovered_centavos bigint check (recovered_centavos >= 0),
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index agent_actions_clinic_idx on public.agent_actions (clinic_id, created_at desc);

create table public.agent_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  kind text not null check (kind in ('reply', 'book_appointment')),
  autonomy public.autonomy_level not null default 'auto',
  daily_limit integer not null default 100 check (daily_limit between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, kind)
);

create trigger conversations_set_updated_at before update on public.conversations for each row execute function private.set_updated_at();
create trigger agent_rules_set_updated_at before update on public.agent_rules for each row execute function private.set_updated_at();

create function private.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end;
$$;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function private.touch_conversation();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.agent_actions enable row level security;
alter table public.agent_rules enable row level security;

-- Inbox access follows the inbox.view capability: owner and receptionist.
create policy conversations_select on public.conversations for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]));
create policy conversations_update on public.conversations for update to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]));

create policy messages_select on public.messages for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[])
    and role = 'staff' and handled_by = 'human'
  );

create policy agent_actions_select on public.agent_actions for select to authenticated
  using (private.has_role(clinic_id, array['owner', 'receptionist']::public.app_role[]));

create policy agent_rules_select on public.agent_rules for select to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy agent_rules_insert on public.agent_rules for insert to authenticated
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));
create policy agent_rules_update on public.agent_rules for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.app_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.app_role[]));

revoke all on public.conversations, public.messages, public.agent_actions, public.agent_rules from anon, authenticated;

-- token_hash is deliberately absent: no client can read it.
grant select (id, clinic_id, patient_id, channel, status, handled_by, handoff_reason, handoff_summary, last_message_at, created_at, updated_at)
  on public.conversations to authenticated;
grant update (status, handled_by) on public.conversations to authenticated;

grant select on public.messages to authenticated;
grant insert (clinic_id, conversation_id, role, handled_by, content) on public.messages to authenticated;

grant select on public.agent_actions to authenticated;

grant select on public.agent_rules to authenticated;
grant insert (clinic_id, kind, autonomy, daily_limit) on public.agent_rules to authenticated;
grant update (autonomy, daily_limit) on public.agent_rules to authenticated;
