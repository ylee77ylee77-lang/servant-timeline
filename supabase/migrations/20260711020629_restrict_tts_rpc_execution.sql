-- TTS tables and quota-reservation RPCs are server-side resources. Postgres
-- grants EXECUTE to PUBLIC by default, so revoke it explicitly by signature.

revoke all on table
  public.app_voice_settings,
  public.tts_usage_monthly,
  public.tts_usage_monthly_by_provider,
  public.tts_audio_cache
from anon, authenticated;

revoke execute on function public.reserve_tts_chars(text, integer, integer)
from public, anon, authenticated;

revoke execute on function public.reserve_tts_chars_v2(text, integer, integer, integer)
from public, anon, authenticated;

-- Both function bodies fully qualify their application tables. Restrict name
-- resolution to trusted built-ins instead of the writable public schema.
alter function public.reserve_tts_chars(text, integer, integer)
  set search_path = pg_catalog;

alter function public.reserve_tts_chars_v2(text, integer, integer, integer)
  set search_path = pg_catalog;

grant execute on function public.reserve_tts_chars(text, integer, integer)
to service_role;

grant execute on function public.reserve_tts_chars_v2(text, integer, integer, integer)
to service_role;
