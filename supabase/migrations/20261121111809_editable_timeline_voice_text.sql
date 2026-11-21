-- Per-node overrides for the existing two reminder moments and three verbosity levels.
-- Null means: use the existing generated reminder wording.
-- Fully additive: no existing task or reminder data is rewritten.
alter table public.timeline_nodes
  add column if not exists voice_pre5_simple text,
  add column if not exists voice_pre5_standard text,
  add column if not exists voice_pre5_detailed text,
  add column if not exists voice_now_simple text,
  add column if not exists voice_now_standard text,
  add column if not exists voice_now_detailed text;

-- Keep customized prompts within the existing Google Cloud TTS 600-character bound.
-- The application normalizes whitespace; a database constraint adds defense in depth.
do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.timeline_nodes'::regclass
      and conname = 'timeline_nodes_voice_text_bounds_check'
  ) then
    alter table public.timeline_nodes
      add constraint timeline_nodes_voice_text_bounds_check
      check (
    (voice_pre5_simple is null or (char_length(voice_pre5_simple) between 1 and 600 and voice_pre5_simple = btrim(voice_pre5_simple)))
    and
    (voice_pre5_standard is null or (char_length(voice_pre5_standard) between 1 and 600 and voice_pre5_standard = btrim(voice_pre5_standard)))
    and
    (voice_pre5_detailed is null or (char_length(voice_pre5_detailed) between 1 and 600 and voice_pre5_detailed = btrim(voice_pre5_detailed)))
    and
    (voice_now_simple is null or (char_length(voice_now_simple) between 1 and 600 and voice_now_simple = btrim(voice_now_simple)))
    and
    (voice_now_standard is null or (char_length(voice_now_standard) between 1 and 600 and voice_now_standard = btrim(voice_now_standard)))
    and
    (voice_now_detailed is null or (char_length(voice_now_detailed) between 1 and 600 and voice_now_detailed = btrim(voice_now_detailed)))
      );
  end if;
end;
$migration$;

comment on column public.timeline_nodes.voice_pre5_simple is 'Optional early simple reminder override; null uses generated text.';
comment on column public.timeline_nodes.voice_pre5_standard is 'Optional early standard reminder override; null uses generated text.';
comment on column public.timeline_nodes.voice_pre5_detailed is 'Optional early detailed reminder override; null uses generated text.';
comment on column public.timeline_nodes.voice_now_simple is 'Optional on-time simple reminder override; null uses generated text.';
comment on column public.timeline_nodes.voice_now_standard is 'Optional on-time standard reminder override; null uses generated text.';
comment on column public.timeline_nodes.voice_now_detailed is 'Optional on-time detailed reminder override; null uses generated text.';

-- Existing timeline_nodes RLS continues to authorize updates to admin users only.
-- No additional grant or policy is introduced by this migration.
