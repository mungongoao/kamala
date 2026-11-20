-- Teacher class scope and coordinator-safe access.
-- This migration preserves the Coordenador role and its existing permissions.
-- It does not delete, deactivate, or convert coordinator accounts.

BEGIN;

-- Protect an existing coordinator from accidental role conversion during credentialing.
CREATE OR REPLACE FUNCTION public.credenciar_usuario(_uid uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM public.user_roles
       WHERE user_id = _uid
         AND role = 'coordenador'
     )
     AND _role <> 'coordenador' THEN
    RAISE EXCEPTION 'Não é permitido alterar o cargo de um Coordenador por esta operação.';
  END IF;

  IF _role = 'admin' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Só o ADM pode atribuir cargo de ADM';
  END IF;

  IF public.has_role(_uid, 'admin')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role);

  UPDATE public.profiles
  SET status = 'APROVADO', cargo_pretendido = _role::text
  WHERE id = _uid;
END;
$$;

-- Prevent overlapping class assignments for the same subject.
-- The transaction lock prevents two concurrent requests from bypassing the check.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_teacher_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(NEW.user_id, 'professor') THEN
    RAISE EXCEPTION 'Só é possível atribuir disciplinas a utilizadores com cargo de Professor.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.subject_id::text, 0));

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
END;
$$;

-- Stop safely if conflicting assignments already exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teacher_assignments a
    JOIN public.teacher_assignments b
      ON a.subject_id = b.subject_id
     AND a.user_id < b.user_id
     AND (
       cardinality(coalesce(a.turmas, '{}'::text[])) = 0
       OR cardinality(coalesce(b.turmas, '{}'::text[])) = 0
       OR coalesce(a.turmas, '{}'::text[]) && coalesce(b.turmas, '{}'::text[])
     )
  ) THEN
    RAISE EXCEPTION 'Existem disciplinas/turmas atribuídas a mais de um professor. Corrija as atribuições antes de aplicar esta migração.';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_teacher_assignment
  ON public.teacher_assignments;

CREATE TRIGGER prevent_duplicate_teacher_assignment
BEFORE INSERT OR UPDATE OF user_id, subject_id, turmas
ON public.teacher_assignments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_teacher_assignment();

-- A professor may see students only in classes/turmas covered by their assignments.
-- Staff and Coordinators retain their access.
CREATE OR REPLACE FUNCTION public.can_view_student(_uid uuid, _student bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_staff(_uid)
    OR public.is_coordinator(_uid)
    OR EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.teacher_assignments ta ON ta.user_id = _uid
      JOIN public.subjects assigned
        ON assigned.id = ta.subject_id
       AND assigned.classe = s.classe
      WHERE s.id = _student
        AND public.has_role(_uid, 'professor')
        AND (
          cardinality(coalesce(ta.turmas, '{}'::text[])) = 0
          OR s.turma = ANY(ta.turmas)
        )
    );
$$;

-- A professor assigned to a class can consult its full grade sheet,
-- while Coordinators and staff retain their access.
CREATE OR REPLACE FUNCTION public.can_view_grade(
  _uid uuid,
  _subject uuid,
  _student bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_staff(_uid)
    OR public.is_coordinator(_uid)
    OR EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.subjects requested
        ON requested.id = _subject
       AND requested.classe = s.classe
      JOIN public.teacher_assignments ta ON ta.user_id = _uid
      JOIN public.subjects assigned
        ON assigned.id = ta.subject_id
       AND assigned.classe = s.classe
      WHERE s.id = _student
        AND public.has_role(_uid, 'professor')
        AND (
          cardinality(coalesce(ta.turmas, '{}'::text[])) = 0
          OR s.turma = ANY(ta.turmas)
        )
    );
$$;

-- Keep archived-student access separate: this policy covers active students only.
DROP POLICY IF EXISTS "authorised read active students" ON public.students;
DROP POLICY IF EXISTS "staff and assigned teachers read students" ON public.students;

CREATE POLICY "staff and assigned teachers read students"
ON public.students
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.is_staff(auth.uid())
    OR public.is_coordinator(auth.uid())
    OR public.can_view_student(auth.uid(), id)
    OR public.is_guardian_of(auth.uid(), id)
  )
);

-- Restrict grade-sheet reads to the assigned class/turma, while preserving
-- guardian, staff, and Coordinator access.
DROP POLICY IF EXISTS "authorised read grades" ON public.grades;
DROP POLICY IF EXISTS "staff assigned teachers and guardians read grades" ON public.grades;

CREATE POLICY "staff assigned teachers and guardians read grades"
ON public.grades
FOR SELECT TO authenticated
USING (
  public.can_view_grade(auth.uid(), subject_id, student_id)
  OR public.is_guardian_of(auth.uid(), student_id)
);

-- Approved users no longer receive a global listing of every teacher assignment.
-- Each teacher sees their own; staff and Coordinators can see all.
DROP POLICY IF EXISTS "approved read assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "own or staff read assignments" ON public.teacher_assignments;

CREATE POLICY "own or staff read assignments"
ON public.teacher_assignments
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_staff(auth.uid())
  OR public.is_coordinator(auth.uid())
);

DROP POLICY IF EXISTS "authorised read faltas" ON public.faltas_alunos;
DROP POLICY IF EXISTS "staff assigned teachers and guardians read faltas" ON public.faltas_alunos;

CREATE POLICY "staff assigned teachers and guardians read faltas"
ON public.faltas_alunos
FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  OR public.is_coordinator(auth.uid())
  OR public.can_view_student(auth.uid(), student_id)
  OR public.is_guardian_of(auth.uid(), student_id)
);

-- Deliberately preserve the existing Coordinator write policy on faltas_alunos.
-- No Coordinator role, helper, enum value, or permission is removed or rewritten.

GRANT EXECUTE ON FUNCTION public.can_view_student(uuid, bigint)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_grade(uuid, uuid, bigint)
  TO authenticated, service_role;

COMMIT;
