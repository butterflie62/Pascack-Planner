create table if not exists public.student_plans (
    user_id uuid primary key references auth.users (id) on delete cascade,
    current_grade smallint not null check (current_grade between 9 and 12),
    courses jsonb not null default '[]'::jsonb check (jsonb_typeof(courses) = 'array'),
    transcript_path text,
    updated_at timestamptz not null default now()
);

alter table public.student_plans enable row level security;

drop policy if exists "Students can view their own plan" on public.student_plans;
create policy "Students can view their own plan"
    on public.student_plans for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Students can create their own plan" on public.student_plans;
create policy "Students can create their own plan"
    on public.student_plans for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their own plan" on public.student_plans;
create policy "Students can update their own plan"
    on public.student_plans for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own plan" on public.student_plans;
create policy "Students can delete their own plan"
    on public.student_plans for delete to authenticated
    using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-transcripts', 'student-transcripts', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

drop policy if exists "Students can view their own transcript" on storage.objects;
create policy "Students can view their own transcript"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'student-transcripts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Students can upload their own transcript" on storage.objects;
create policy "Students can upload their own transcript"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'student-transcripts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Students can update their own transcript" on storage.objects;
create policy "Students can update their own transcript"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'student-transcripts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'student-transcripts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Students can delete their own transcript" on storage.objects;
create policy "Students can delete their own transcript"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'student-transcripts'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );
