-- SplitSnap accounts and end-to-end encrypted sync.
--
-- Run once: Supabase dashboard → SQL Editor → paste this file → Run.
-- (Or `supabase db push` with the Supabase CLI.)
--
-- The server never sees readable data. Records are encrypted on the device
-- (src/sync/crypto.ts), named by an HMAC instead of their table and id, and
-- photos are uploaded already encrypted. Row-level security keeps every user
-- to their own rows.

-- ---------------------------------------------------------------------------
-- vaults: one per user. The random vault key every record is encrypted under,
-- wrapped twice: by a key derived from the password, and by the recovery key.

create table public.vaults (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kdf jsonb not null,
  wrapped_password text not null,
  wrapped_recovery text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vaults enable row level security;

create policy "Users manage their own vault" on public.vaults
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- records: every synced row (person, group, receipt, category, photo
-- metadata) as ciphertext. `seq` increases with every write, so a device
-- pulls "everything after the last seq I saw".

create sequence public.records_seq;

create table public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  data text,
  deleted boolean not null default false,
  changed_at bigint not null,
  seq bigint not null default nextval('public.records_seq'),
  primary key (user_id, key),
  check (deleted or data is not null)
);

create index records_user_seq on public.records (user_id, seq);

alter table public.records enable row level security;

create policy "Users manage their own records" on public.records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Every insert and update takes a new seq. The per-user lock makes one user's
-- writes commit one after another, so seq order is commit order: a device
-- pulling "seq > cursor" can't skip a row that was still committing.
create function public.records_next_seq() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  new.seq := pg_catalog.nextval('public.records_seq');
  return new;
end;
$$;

create trigger records_next_seq
  before insert or update on public.records
  for each row execute function public.records_next_seq();

-- ---------------------------------------------------------------------------
-- Access: signed-in users only (row-level security narrows it to their rows).

revoke all on public.vaults, public.records from anon;
grant select, insert, update, delete on public.vaults, public.records to authenticated;
grant usage on sequence public.records_seq to authenticated;

-- ---------------------------------------------------------------------------
-- photos: a private bucket. Each user's encrypted photos live under
-- "<user id>/<record key>", and users can only touch their own folder.

insert into storage.buckets (id, name, public, file_size_limit)
values ('photos', 'photos', false, 20971520)
on conflict (id) do nothing;

create policy "Users read their own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users add their own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users replace their own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete their own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Deleting an account. The app deletes the user's photos through the Storage
-- API first (Supabase doesn't allow deleting storage objects from SQL); this
-- then deletes the user, and the cascades remove their vault and records.

create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
