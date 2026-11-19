import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Nota } from "./avaliacao";

export type Papel = "admin" | "pedagogico" | "coordenador" | "professor" | "encarregado";

export const NOMES_PAPEL: Record<Papel, string> = {
  admin: "Administrador (ADM)",
  pedagogico: "Pedagógico",
  coordenador: "Professor",
  professor: "Professor",
  encarregado: "Encarregado de Educação",
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const papeis = (roles ?? []).map((r) => (r.role === "coordenador" ? "professor" : r.role) as Papel);
      const aprovado = profile?.status === "APROVADO" && !profile?.deleted_at;
      const tem = (p: Papel) => aprovado && papeis.includes(p);
      return {
        id: u.user.id,
        profile,
        papeis,
        aprovado,
        isAdmin: tem("admin"),
        isPedagogico: tem("pedagogico"),
        isStaff: tem("admin") || tem("pedagogico"),
        podeImprimirBoletim: tem("admin") || tem("pedagogico"),
        podeLancarFaltas: tem("admin"),
        isProfessor: tem("professor"),
        isCoordenador: false,
        podeExportarDocumentos: tem("admin") || tem("pedagogico"),
        isEncarregado: tem("encarregado"),
      };
    },
  });
}

export function useInstituicao() {
  return useQuery({
    queryKey: ["instituicao"],
    queryFn: async () => {
      const { data, error } = await supabase.from("institution_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (typeof document !== "undefined" && data) {
        const root = document.documentElement;
        if (data.cor_fundo) root.style.setProperty("--background", data.cor_fundo);
        if (data.cor_texto) root.style.setProperty("--foreground", data.cor_texto);
        if (data.cor_paginas) {
          root.style.setProperty("--card", data.cor_paginas);
          root.style.setProperty("--popover", data.cor_paginas);
        }
        if (data.cor_texto) {
          root.style.setProperty("--card-foreground", data.cor_texto);
          root.style.setProperty("--popover-foreground", data.cor_texto);
        }
      }
      return data;
    },
  });
}

export type Disciplina = { id: string; classe: string; nome: string; extra: boolean; ordem: number };

export function useDisciplinas(classe?: string) {
  return useQuery({
    queryKey: ["disciplinas", classe ?? "all"],
    queryFn: async () => {
      let q = supabase.from("subjects").select("*").order("extra").order("ordem").order("nome");
      if (classe) q = q.eq("classe", classe);
      const { data, error } = await q;
      if (error) throw error;
      return data as Disciplina[];
    },
  });
}

export type Aluno = {
  id: number;
  nome: string;
  genero: string;
  classe: string;
  turma: string;
  estado: "Activo" | "Desistente";
};

export function useAlunos(classe?: string) {
  return useQuery({
    queryKey: ["alunos", classe ?? "all"],
    queryFn: async () => {
      let q = supabase.from("students").select("id,nome,genero,classe,turma,estado").is("deleted_at", null).order("nome");
      if (classe) q = q.eq("classe", classe);
      let { data, error } = await q;
      // Compatibilidade com bases onde a migração do Lixo ainda não foi aplicada.
      if (error) {
        let fallback = supabase.from("students").select("id,nome,genero,classe,turma,estado").order("nome");
        if (classe) fallback = fallback.eq("classe", classe);
        const result = await fallback;
        data = result.data;
        error = result.error;
      }
      if (error) throw error;
      const lista = (data ?? []) as Aluno[];
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    },
  });
}

export type NotaRow = Nota & { id: string; student_id: number; subject_id: string };

export function useNotasClasse(classe: string) {
  return useQuery({
    queryKey: ["notas", classe],
    enabled: !!classe,
    queryFn: async () => {
      const { data: alunos, error: alunosError } = await supabase.from("students").select("id").eq("classe", classe);
      if (alunosError) throw alunosError;
      const ids = (alunos ?? []).map((a) => a.id);
      if (ids.length === 0) return [] as NotaRow[];
      const { data, error } = await supabase.from("grades").select("*").in("student_id", ids);
      if (error) throw error;
      return (data ?? []) as NotaRow[];
    },
  });
}

export type FaltaRow = { id: string; student_id: number; trimestre: number; faltas: number };

export function useFaltasClasse(classe: string) {
  return useQuery({
    queryKey: ["faltas", classe],
    enabled: !!classe,
    queryFn: async () => {
      const { data: alunos, error: e1 } = await supabase.from("students").select("id").eq("classe", classe);
      if (e1) throw e1;
      const ids = (alunos ?? []).map((a) => a.id);
      if (!ids.length) return [] as FaltaRow[];
      const { data, error } = await supabase.from("faltas_alunos").select("*").in("student_id", ids);
      if (error) throw error;
      return (data ?? []) as FaltaRow[];
    },
  });
}
