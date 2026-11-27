-- Emergency handoffs get their own reason so staff can spot them at once in the inbox.
-- Only server code (the deterministic emergency check) writes it; the model's tool keeps its own list.
alter table public.conversations drop constraint conversations_handoff_reason_check;
alter table public.conversations
  add constraint conversations_handoff_reason_check
  check (handoff_reason in ('emergency', 'medical', 'refund', 'upset', 'requested', 'booking', 'other'));
