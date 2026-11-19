-- Teacher access, one teacher per subject/class group, and coordinator retirement.
-- Safe to apply repeatedly; existing grade and student records are preserved.

CREATE OR REPLACE FUNCTION public.is_coordinator(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT false
$$;

DELETE FROM public.user_roles legacy USING public.user_roles current_professor
WHERE legacy.user_id = current_professor.user_id
  AND legacy.role = 'coordenador' AND current_professor.role = 'professor';
UPDATE public.user_roles SET role = 'professor' WHERE role = 'coordenador';
UPDATE public.profiles
SET cargo_pretendido = 'professor'
WHERE lower(coalesce(cargo_pretendido, '')) IN ('coordenador', 'coordinator');

CREATE OR REPLACE FUNCTION public.credenciar_usuario(_uid uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _effective_role public.app_role;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  _effective_role := CASE WHEN _role = 'coordenador' THEN 'professor'::public.app_role ELSE _role END;
  IF _effective_role = 'admin' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Só o ADM pode atribuir cargo de ADM'; END IF;
  IF public.has_role(_uid,'admin') AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _effective_role);
  UPDATE public.profiles SET status = 'APROVADO', cargo_pretendido = _effective_role::text WHERE id = _uid;
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_teacher_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teacher_assignments other
    WHERE other.subject_id = NEW.subject_id
      AND other.user_id <> NEW.user_id
      AND other.id IS DISTINCT FROM NEW.id
      AND (
        cardinality(coalesce(other.turmas, '{}'::text[])) = 0
        OR cardinality(coalesce(NEW.turmas, '{}'::text[])) = 0
        OR coalesce(other.turmas, '{}'::text[]) && coalesce(NEW.turmas, '{}'::text[])
      )
  ) THEN
    RAISE EXCEPTION 'Esta disciplina já está atribuída a outro professor numa ou mais turmas seleccionadas.';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_teacher_assignment ON public.teacher_assignments;
CREATE TRIGGER prevent_duplicate_teacher_assignment
BEFORE INSERT OR UPDATE OF user_id, subject_id, turmas ON public.teacher_assignments
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_teacher_assignment();

CREATE OR REPLACE FUNCTION public.can_view_student(_uid uuid, _student bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(_uid) OR EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.teacher_assignments ta ON ta.user_id = _uid
    JOIN public.subjects assigned ON assigned.id = ta.subject_id AND assigned.classe = s.classe
    WHERE s.id = _student
      AND public.has_role(_uid, 'professor')
      AND (cardinality(coalesce(ta.turmas, '{}'::text[])) = 0 OR s.turma = ANY(ta.turmas))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_grade(_uid uuid, _subject uuid, _student bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(_uid) OR EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.subjects requested ON requested.id = _subject AND requested.classe = s.classe
    JOIN public.teacher_assignments ta ON ta.user_id = _uid
    JOIN public.subjects assigned ON assigned.id = ta.subject_id AND assigned.classe = s.classe
    WHERE s.id = _student
      AND public.has_role(_uid, 'professor')
      AND (cardinality(coalesce(ta.turmas, '{}'::text[])) = 0 OR s.turma = ANY(ta.turmas))
  )
$$;

DROP POLICY IF EXISTS "authorised read students" ON public.students;
DROP POLICY IF EXISTS "approved read students" ON public.students;
CREATE POLICY "staff and assigned teachers read students" ON public.students
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR public.can_view_student(auth.uid(), id) OR public.is_guardian_of(auth.uid(), id));

DROP POLICY IF EXISTS "authorised read grades" ON public.grades;
DROP POLICY IF EXISTS "approved read grades" ON public.grades;
CREATE POLICY "staff assigned teachers and guardians read grades" ON public.grades
FOR SELECT TO authenticated
USING (public.can_view_grade(auth.uid(), subject_id, student_id) OR public.is_guardian_of(auth.uid(), student_id));

DROP POLICY IF EXISTS "approved read assignments" ON public.teacher_assignments;
CREATE POLICY "own or staff read assignments" ON public.teacher_assignments
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authorised read faltas" ON public.faltas_alunos;
CREATE POLICY "staff assigned teachers and guardians read faltas" ON public.faltas_alunos
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR public.can_view_student(auth.uid(), student_id) OR public.is_guardian_of(auth.uid(), student_id));

DROP POLICY IF EXISTS "adm coord write faltas" ON public.faltas_alunos;
CREATE POLICY "staff write faltas" ON public.faltas_alunos
FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

GRANT EXECUTE ON FUNCTION public.can_view_student(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_grade(uuid, uuid, bigint) TO authenticated, service_role;
