create table if not exists public.orbit_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  friend_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  is_public boolean not null default false,
  credits bigint not null default 0 check (credits >= 0),
  completed_sessions integer not null default 0 check (completed_sessions >= 0),
  created_at timestamptz not null default now()
);

alter table public.orbit_profiles add column if not exists friend_code text;

update public.orbit_profiles
set friend_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where friend_code is null;

alter table public.orbit_profiles
  alter column friend_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  alter column friend_code set not null;

create unique index if not exists orbit_profiles_friend_code_key
  on public.orbit_profiles (friend_code);

create table if not exists public.orbit_friendships (
  user_low uuid not null references public.orbit_profiles (user_id) on delete cascade,
  user_high uuid not null references public.orbit_profiles (user_id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by = user_low or requested_by = user_high)
);

create table if not exists public.orbit_focus_sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  duration_ms integer not null check (duration_ms between 60000 and 86400000),
  credits integer not null check (credits > 0),
  completed_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.orbit_profiles enable row level security;
alter table public.orbit_friendships enable row level security;
alter table public.orbit_focus_sessions enable row level security;

revoke all on public.orbit_profiles from anon, authenticated;
revoke all on public.orbit_friendships from anon, authenticated;
revoke all on public.orbit_focus_sessions from anon, authenticated;

create or replace function public.join_leaderboard(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(p_display_name);
  profile public.orbit_profiles;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 24
      or clean_name !~ '^[[:alnum:] _.-]+$' then
    raise exception 'Choose a display name of 2-24 letters, numbers, spaces, dots, underscores, or hyphens.';
  end if;

  insert into public.orbit_profiles (user_id, display_name, is_public)
  values (auth.uid(), clean_name, true)
  on conflict (user_id) do update
    set display_name = excluded.display_name, is_public = true
  returning * into profile;

  return jsonb_build_object(
    'display_name', profile.display_name,
    'friend_code', profile.friend_code,
    'credits', profile.credits,
    'completed_sessions', profile.completed_sessions,
    'is_public', profile.is_public
  );
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select case when p.user_id is null then null else jsonb_build_object(
    'display_name', p.display_name,
    'friend_code', p.friend_code,
    'credits', p.credits,
    'completed_sessions', p.completed_sessions,
    'is_public', p.is_public
  ) end
  from (select auth.uid() as user_id) u
  left join public.orbit_profiles p on p.user_id = u.user_id;
$$;

create or replace function public.leave_leaderboard()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;
  delete from public.orbit_profiles where user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.record_focus_session(p_session_id text, p_duration_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  award integer;
  inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;
  if p_session_id is null or char_length(p_session_id) > 64 then
    raise exception 'Invalid session identifier.';
  end if;
  if p_duration_ms is null or p_duration_ms < 60000 or p_duration_ms > 86400000 then
    raise exception 'Session duration is outside the allowed range.';
  end if;
  if not exists (
    select 1 from public.orbit_profiles
    where user_id = auth.uid() and is_public = true
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'not_joined');
  end if;

  award := greatest(1, floor(p_duration_ms / 6000.0)::integer);
  insert into public.orbit_focus_sessions (user_id, session_id, duration_ms, credits)
  values (auth.uid(), p_session_id, p_duration_ms, award)
  on conflict (user_id, session_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.orbit_profiles
    set credits = credits + award, completed_sessions = completed_sessions + 1
    where user_id = auth.uid();
  end if;

  return jsonb_build_object('recorded', inserted_count > 0, 'credits', award);
end;
$$;

create or replace function public.get_leaderboard()
returns table (
  rank bigint,
  display_name text,
  credits bigint,
  completed_sessions integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by p.credits desc, p.completed_sessions desc, p.created_at asc),
         p.display_name, p.credits, p.completed_sessions
  from public.orbit_profiles p
  where p.is_public = true
  order by p.credits desc, p.completed_sessions desc, p.created_at asc
  limit 50;
$$;

create or replace function public.add_friend(p_friend_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  friend_profile public.orbit_profiles;
  low_id uuid;
  high_id uuid;
  friendship public.orbit_friendships;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;
  if p_friend_code is null or upper(btrim(p_friend_code)) !~ '^[A-F0-9]{12}$' then
    raise exception 'Enter a valid 12-character friend code.';
  end if;
  if not exists (
    select 1 from public.orbit_profiles
    where user_id = auth.uid() and is_public = true
  ) then
    raise exception 'Join the leaderboard before adding friends.';
  end if;

  select * into friend_profile
  from public.orbit_profiles
  where friend_code = upper(btrim(p_friend_code)) and is_public = true;
  if not found then
    raise exception 'No public Orbit member has that friend code.';
  end if;
  if friend_profile.user_id = auth.uid() then
    raise exception 'You cannot add yourself as a friend.';
  end if;

  if auth.uid() < friend_profile.user_id then
    low_id := auth.uid();
    high_id := friend_profile.user_id;
  else
    low_id := friend_profile.user_id;
    high_id := auth.uid();
  end if;

  select * into friendship
  from public.orbit_friendships
  where user_low = low_id and user_high = high_id;
  if found then
    if friendship.status = 'accepted' then
      raise exception 'You are already friends.';
    end if;
    if friendship.status = 'pending' then
      if friendship.requested_by = auth.uid() then
        raise exception 'Your friend request is already pending.';
      end if;
      raise exception 'This member already sent you a request. Accept it in your requests.';
    end if;

    update public.orbit_friendships
    set status = 'pending', requested_by = auth.uid(), updated_at = now()
    where user_low = low_id and user_high = high_id;
  else
    insert into public.orbit_friendships (user_low, user_high, requested_by, status)
    values (low_id, high_id, auth.uid(), 'pending');
  end if;

  return jsonb_build_object('status', 'pending', 'display_name', friend_profile.display_name);
end;
$$;

create or replace function public.get_my_friends()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', p.display_name,
        'friend_code', p.friend_code,
        'credits', p.credits,
        'completed_sessions', p.completed_sessions
      ) order by p.display_name)
      from public.orbit_friendships f
      join public.orbit_profiles p
        on p.user_id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
      where f.status = 'accepted'
        and (f.user_low = auth.uid() or f.user_high = auth.uid())
        and p.is_public = true
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', p.display_name,
        'friend_code', p.friend_code
      ) order by f.created_at)
      from public.orbit_friendships f
      join public.orbit_profiles p on p.user_id = f.requested_by
      where f.status = 'pending'
        and (f.user_low = auth.uid() or f.user_high = auth.uid())
        and f.requested_by <> auth.uid()
        and p.is_public = true
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', p.display_name
      ) order by f.created_at)
      from public.orbit_friendships f
      join public.orbit_profiles p
        on p.user_id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
      where f.status = 'pending'
        and f.requested_by = auth.uid()
        and p.is_public = true
    ), '[]'::jsonb)
  );
$$;

create or replace function public.respond_friend_request(p_friend_code text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  friend_profile public.orbit_profiles;
  updated_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;
  if p_friend_code is null or upper(btrim(p_friend_code)) !~ '^[A-F0-9]{12}$' then
    raise exception 'Invalid friend request.';
  end if;

  select * into friend_profile
  from public.orbit_profiles
  where friend_code = upper(btrim(p_friend_code)) and is_public = true;
  if not found or friend_profile.user_id = auth.uid() then
    raise exception 'Friend request not found.';
  end if;

  update public.orbit_friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      updated_at = now()
  where user_low = least(auth.uid(), friend_profile.user_id)
    and user_high = greatest(auth.uid(), friend_profile.user_id)
    and status = 'pending'
    and requested_by = friend_profile.user_id
  returning status into updated_status;
  if not found then
    raise exception 'Friend request is no longer pending.';
  end if;

  return jsonb_build_object('status', updated_status, 'display_name', friend_profile.display_name);
end;
$$;

create or replace function public.remove_friend(p_friend_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  friend_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;
  if p_friend_code is null or upper(btrim(p_friend_code)) !~ '^[A-F0-9]{12}$' then
    raise exception 'Invalid friend code.';
  end if;

  select user_id into friend_user_id
  from public.orbit_profiles
  where friend_code = upper(btrim(p_friend_code)) and is_public = true;
  if not found then
    return false;
  end if;

  delete from public.orbit_friendships
  where user_low = least(auth.uid(), friend_user_id)
    and user_high = greatest(auth.uid(), friend_user_id)
    and status = 'accepted';
  return found;
end;
$$;

revoke all on function public.join_leaderboard(text) from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.leave_leaderboard() from public;
revoke all on function public.record_focus_session(text, integer) from public;
revoke all on function public.get_leaderboard() from public;
revoke all on function public.add_friend(text) from public;
revoke all on function public.get_my_friends() from public;
revoke all on function public.respond_friend_request(text, boolean) from public;
revoke all on function public.remove_friend(text) from public;
grant execute on function public.join_leaderboard(text) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.leave_leaderboard() to authenticated;
grant execute on function public.record_focus_session(text, integer) to authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;
grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.get_my_friends() to authenticated;
grant execute on function public.respond_friend_request(text, boolean) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
