BEGIN;
CREATE TABLE IF NOT EXISTS public.teacher_access_control (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 allowed_weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[],
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.profiles(id)
);
CREATE TABLE IF NOT EXISTS public.teacher_daily_usage (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 usage_date date NOT NULL,
 used_seconds integer NOT NULL DEFAULT 0 CHECK (used_seconds >= 0),
 session_active boolean NOT NULL DEFAULT false,
 last_heartbeat_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, usage_date)
);
ALTER TABLE public.teacher_access_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_access_control, public.teacher_daily_usage FROM anon, authenticated;
GRANT SELECT ON public.teacher_access_control, public.teacher_daily_usage TO authenticated;
GRANT ALL ON public.teacher_access_control, public.teacher_daily_usage TO service_role;
INSERT INTO public.teacher_access_control(user_id)
 SELECT DISTINCT user_id FROM public.user_roles
 WHERE role='professor' AND NOT public.has_role(user_id,'coordenador')
 ON CONFLICT(user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.teacher_daily_limit_seconds(_at timestamptz DEFAULT now())
RETURNS integer LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN extract(isodow FROM (_at AT TIME ZONE 'Africa/Luanda')) IN (6,7) THEN 5400 ELSE 3600 END
$$;

CREATE OR REPLACE FUNCTION public.teacher_usage_status()
RETURNS TABLE(enabled boolean,allowed_weekdays smallint[],used_seconds integer,limit_seconds integer,remaining_seconds integer,session_active boolean,usage_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); d date:=(now() AT TIME ZONE 'Africa/Luanda')::date; wd smallint:=extract(isodow FROM now() AT TIME ZONE 'Africa/Luanda')::smallint; en boolean; days smallint[]; used integer; active boolean; lim integer;
BEGIN
 IF u IS NULL OR NOT public.has_role(u,'professor') THEN RAISE EXCEPTION 'Disponível apenas para Professores.'; END IF;
 SELECT c.enabled,c.allowed_weekdays INTO en,days FROM public.teacher_access_control c WHERE c.user_id=u;
 IF NOT FOUND THEN
  INSERT INTO public.teacher_access_control(user_id) VALUES(u) ON CONFLICT DO NOTHING;
  SELECT c.enabled,c.allowed_weekdays INTO en,days FROM public.teacher_access_control c WHERE c.user_id=u;
 END IF;
 INSERT INTO public.teacher_daily_usage(user_id,usage_date) VALUES(u,d) ON CONFLICT DO NOTHING;
 SELECT x.used_seconds,x.session_active INTO used,active FROM public.teacher_daily_usage x WHERE x.user_id=u AND x.usage_date=d;
 lim:=public.teacher_daily_limit_seconds(now());
 enabled:=coalesce(en,false) AND wd=ANY(coalesce(days,ARRAY[]::smallint[]));
 allowed_weekdays:=coalesce(days,ARRAY[]::smallint[]); used_seconds:=coalesce(used,0); limit_seconds:=lim;
 remaining_seconds:=greatest(0,lim-used_seconds); session_active:=coalesce(active,false); usage_date:=d; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.teacher_usage_start()
RETURNS TABLE(enabled boolean,allowed_weekdays smallint[],used_seconds integer,limit_seconds integer,remaining_seconds integer,session_active boolean,usage_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; u uuid:=auth.uid(); d date:=(now() AT TIME ZONE 'Africa/Luanda')::date;
BEGIN
 SELECT * INTO s FROM public.teacher_usage_status();
 IF NOT s.enabled THEN RAISE EXCEPTION 'Acesso não autorizado para hoje. Contacte o ADM.'; END IF;
 IF s.remaining_seconds<=0 THEN RAISE EXCEPTION 'Tempo diário terminado. Poderá voltar amanhã.'; END IF;
 INSERT INTO public.teacher_daily_usage(user_id,usage_date,session_active,last_heartbeat_at) VALUES(u,d,true,now())
 ON CONFLICT(user_id,usage_date) DO UPDATE SET session_active=true,last_heartbeat_at=now(),updated_at=now();
 RETURN QUERY SELECT * FROM public.teacher_usage_status();
END $$;

CREATE OR REPLACE FUNCTION public.teacher_usage_heartbeat()
RETURNS TABLE(enabled boolean,allowed_weekdays smallint[],used_seconds integer,limit_seconds integer,remaining_seconds integer,session_active boolean,usage_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); d date:=(now() AT TIME ZONE 'Africa/Luanda')::date; x public.teacher_daily_usage%ROWTYPE; a public.teacher_access_control%ROWTYPE; elapsed integer:=0; lim integer:=public.teacher_daily_limit_seconds(now());
BEGIN
 IF u IS NULL OR NOT public.has_role(u,'professor') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 SELECT * INTO a FROM public.teacher_access_control WHERE user_id=u;
 IF NOT FOUND OR NOT a.enabled OR NOT (extract(isodow FROM now() AT TIME ZONE 'Africa/Luanda')::smallint=ANY(a.allowed_weekdays)) THEN RAISE EXCEPTION 'Acesso não autorizado hoje.'; END IF;
 SELECT * INTO x FROM public.teacher_daily_usage WHERE user_id=u AND usage_date=d FOR UPDATE;
 IF NOT FOUND OR NOT x.session_active THEN RAISE EXCEPTION 'Sessão não activa.'; END IF;
 IF x.last_heartbeat_at IS NOT NULL AND now()-x.last_heartbeat_at<=interval '45 seconds' THEN elapsed:=greatest(0,floor(extract(epoch FROM now()-x.last_heartbeat_at))::integer); END IF;
 UPDATE public.teacher_daily_usage SET used_seconds=least(lim,used_seconds+elapsed),session_active=(used_seconds+elapsed<lim),last_heartbeat_at=now(),updated_at=now() WHERE user_id=u AND usage_date=d;
 RETURN QUERY SELECT * FROM public.teacher_usage_status();
END $$;

CREATE OR REPLACE FUNCTION public.teacher_usage_pause()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); d date:=(now() AT TIME ZONE 'Africa/Luanda')::date; x public.teacher_daily_usage%ROWTYPE; elapsed integer:=0; lim integer:=public.teacher_daily_limit_seconds(now());
BEGIN
 IF u IS NULL THEN RETURN; END IF;
 SELECT * INTO x FROM public.teacher_daily_usage WHERE user_id=u AND usage_date=d FOR UPDATE;
 IF NOT FOUND OR NOT x.session_active THEN RETURN; END IF;
 IF x.last_heartbeat_at IS NOT NULL AND now()-x.last_heartbeat_at<=interval '45 seconds' THEN elapsed:=greatest(0,floor(extract(epoch FROM now()-x.last_heartbeat_at))::integer); END IF;
 UPDATE public.teacher_daily_usage SET used_seconds=least(lim,used_seconds+elapsed),session_active=false,last_heartbeat_at=NULL,updated_at=now() WHERE user_id=u AND usage_date=d;
END $$;

CREATE OR REPLACE FUNCTION public.set_teacher_access(_uid uuid,_enabled boolean,_allowed_weekdays smallint[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF NOT public.has_role(_uid,'professor') THEN RAISE EXCEPTION 'Utilizador não é Professor.'; END IF;
 IF public.has_role(_uid,'coordenador') THEN RAISE EXCEPTION 'O Coordenador está protegido.'; END IF;
 IF _allowed_weekdays IS NOT NULL AND (cardinality(_allowed_weekdays)>7 OR EXISTS(SELECT 1 FROM unnest(_allowed_weekdays) n WHERE n<1 OR n>7)) THEN RAISE EXCEPTION 'Dias inválidos.'; END IF;
 INSERT INTO public.teacher_access_control(user_id,enabled,allowed_weekdays,updated_at,updated_by)
 VALUES(_uid,_enabled,coalesce(_allowed_weekdays,ARRAY[1,2,3,4,5,6,7]::smallint[]),now(),auth.uid())
 ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,
 allowed_weekdays=CASE WHEN _allowed_weekdays IS NULL THEN public.teacher_access_control.allowed_weekdays ELSE EXCLUDED.allowed_weekdays END,
 updated_at=now(),updated_by=auth.uid();
 IF NOT _enabled THEN UPDATE public.teacher_daily_usage SET session_active=false,last_heartbeat_at=NULL,updated_at=now() WHERE user_id=_uid AND usage_date=(now() AT TIME ZONE 'Africa/Luanda')::date; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_all_teachers_access(_enabled boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 INSERT INTO public.teacher_access_control(user_id,enabled)
 SELECT DISTINCT ur.user_id,_enabled FROM public.user_roles ur WHERE ur.role='professor' AND NOT public.has_role(ur.user_id,'coordenador')
 ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now(),updated_by=auth.uid();
 GET DIAGNOSTICS n=ROW_COUNT;
 IF NOT _enabled THEN
  UPDATE public.teacher_daily_usage x SET session_active=false,last_heartbeat_at=NULL,updated_at=now()
  WHERE x.usage_date=(now() AT TIME ZONE 'Africa/Luanda')::date AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=x.user_id AND ur.role='professor' AND NOT public.has_role(ur.user_id,'coordenador'));
 END IF;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_teacher_daily_time()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); d date:=(now() AT TIME ZONE 'Africa/Luanda')::date; x public.teacher_daily_usage%ROWTYPE; a public.teacher_access_control%ROWTYPE; elapsed integer:=0; lim integer:=public.teacher_daily_limit_seconds(now());
BEGIN
 IF u IS NULL OR NOT public.has_role(u,'professor') OR public.is_staff(u) OR public.is_coordinator(u) THEN RETURN NEW; END IF;
 SELECT * INTO a FROM public.teacher_access_control WHERE user_id=u;
 IF NOT FOUND OR NOT a.enabled OR NOT (extract(isodow FROM now() AT TIME ZONE 'Africa/Luanda')::smallint=ANY(a.allowed_weekdays)) THEN RAISE EXCEPTION 'Autorização suspensa para hoje.'; END IF;
 SELECT * INTO x FROM public.teacher_daily_usage WHERE user_id=u AND usage_date=d FOR UPDATE;
 IF NOT FOUND OR NOT x.session_active OR x.last_heartbeat_at IS NULL OR now()-x.last_heartbeat_at>interval '45 seconds' THEN RAISE EXCEPTION 'Sessão expirada. Actualize a página para retomar.'; END IF;
 elapsed:=greatest(0,floor(extract(epoch FROM now()-x.last_heartbeat_at))::integer);
 IF x.used_seconds+elapsed>=lim THEN
  UPDATE public.teacher_daily_usage SET used_seconds=lim,session_active=false,last_heartbeat_at=NULL,updated_at=now() WHERE user_id=u AND usage_date=d;
  RAISE EXCEPTION 'Tempo diário terminado. Poderá lançar notas amanhã.';
 END IF;
 UPDATE public.teacher_daily_usage SET used_seconds=least(lim,used_seconds+elapsed),last_heartbeat_at=now(),updated_at=now() WHERE user_id=u AND usage_date=d;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_teacher_daily_time_before_grade_write ON public.grades;
CREATE TRIGGER enforce_teacher_daily_time_before_grade_write BEFORE INSERT OR UPDATE ON public.grades
FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_daily_time();

REVOKE ALL ON FUNCTION public.teacher_usage_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_usage_start() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_usage_heartbeat() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_usage_pause() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_teacher_access(uuid,boolean,smallint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_all_teachers_access(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_usage_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_usage_start() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_usage_heartbeat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_usage_pause() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_teacher_access(uuid,boolean,smallint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_all_teachers_access(boolean) TO authenticated;
CREATE POLICY "staff read teacher access controls" ON public.teacher_access_control
 FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff read teacher daily usage" ON public.teacher_daily_usage
 FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

COMMIT;