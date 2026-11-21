create table if not exists public.orbit_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  is_public boolean not null default false,
  credits bigint not null default 0 check (credits >= 0),
  completed_sessions integer not null default 0 check (completed_sessions >= 0),
  created_at timestamptz not null default now()
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
alter table public.orbit_focus_sessions enable row level security;

revoke all on public.orbit_profiles from anon, authenticated;
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

revoke all on function public.join_leaderboard(text) from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.leave_leaderboard() from public;
revoke all on function public.record_focus_session(text, integer) from public;
revoke all on function public.get_leaderboard() from public;
grant execute on function public.join_leaderboard(text) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.leave_leaderboard() to authenticated;
grant execute on function public.record_focus_session(text, integer) to authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;
