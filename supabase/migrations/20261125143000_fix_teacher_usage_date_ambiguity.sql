BEGIN;

-- Corrige a ambiguidade entre a coluna usage_date e a variável de saída
-- usage_date das funções RETURNS TABLE.

CREATE OR REPLACE FUNCTION public.teacher_usage_start()
RETURNS TABLE(
  enabled boolean,
  allowed_weekdays smallint[],
  used_seconds integer,
  limit_seconds integer,
  remaining_seconds integer,
  session_active boolean,
  usage_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  u uuid := auth.uid();
  d date := (now() AT TIME ZONE 'Africa/Luanda')::date;
BEGIN
  SELECT * INTO s FROM public.teacher_usage_status();

  IF NOT s.enabled THEN
    RAISE EXCEPTION 'Acesso não autorizado para hoje. Contacte o ADM.';
  END IF;

  IF s.remaining_seconds <= 0 THEN
    RAISE EXCEPTION 'Tempo diário terminado. Poderá voltar amanhã.';
  END IF;

  INSERT INTO public.teacher_daily_usage AS usage_row
    (user_id, usage_date, session_active, last_heartbeat_at)
  VALUES
    (u, d, true, now())
  ON CONFLICT ON CONSTRAINT teacher_daily_usage_pkey
  DO UPDATE SET
    session_active = true,
    last_heartbeat_at = now(),
    updated_at = now();

  RETURN QUERY SELECT * FROM public.teacher_usage_status();
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_usage_heartbeat()
RETURNS TABLE(
  enabled boolean,
  allowed_weekdays smallint[],
  used_seconds integer,
  limit_seconds integer,
  remaining_seconds integer,
  session_active boolean,
  usage_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u uuid := auth.uid();
  d date := (now() AT TIME ZONE 'Africa/Luanda')::date;
  x public.teacher_daily_usage%ROWTYPE;
  a public.teacher_access_control%ROWTYPE;
  elapsed integer := 0;
  lim integer := public.teacher_daily_limit_seconds(now());
BEGIN
  IF u IS NULL OR NOT public.has_role(u, 'professor') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  SELECT * INTO a
  FROM public.teacher_access_control
  WHERE user_id = u;

  IF NOT FOUND OR NOT a.enabled OR NOT (
    extract(isodow FROM now() AT TIME ZONE 'Africa/Luanda')::smallint = ANY(a.allowed_weekdays)
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado hoje.';
  END IF;

  SELECT * INTO x
  FROM public.teacher_daily_usage AS usage_row
  WHERE usage_row.user_id = u AND usage_row.usage_date = d
  FOR UPDATE;

  IF NOT FOUND OR NOT x.session_active THEN
    RAISE EXCEPTION 'Sessão não activa.';
  END IF;

  IF x.last_heartbeat_at IS NOT NULL
     AND now() - x.last_heartbeat_at <= interval '45 seconds' THEN
    elapsed := greatest(0, floor(extract(epoch FROM now() - x.last_heartbeat_at))::integer);
  END IF;

  UPDATE public.teacher_daily_usage AS usage_row
  SET
    used_seconds = least(lim, usage_row.used_seconds + elapsed),
    session_active = (usage_row.used_seconds + elapsed < lim),
    last_heartbeat_at = now(),
    updated_at = now()
  WHERE usage_row.user_id = u
    AND usage_row.usage_date = d;

  RETURN QUERY SELECT * FROM public.teacher_usage_status();
END;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_usage_start() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_usage_heartbeat() TO authenticated;

COMMIT;
