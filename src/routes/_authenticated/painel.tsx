import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAlunos, useDisciplinas, useInstituicao, useMe } from "@/lib/dados";
import { Card, CardContent } from "@/components/ui/card";
import { PageTitle } from "@/components/escola";
import { Users, UserRound, GraduationCap, BookOpen, CalendarDays, ClipboardCheck } from "lucide-react";
import { NOMES_PAPEL } from "@/lib/dados";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({ meta: [{ title: "Painel — KAMALA" }, { name: "description", content: "Resumo do sistema pedagógico." }] }),
  component: Painel,
});

function useContadores() {
  return useQuery({
    queryKey: ["contadores-painel"],
    queryFn: async () => {
      const [{ count: professores }, { data: notas }] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "professor"),
        supabase.from("grades").select("student_id"),
      ]);
      const avaliados = new Set((notas ?? []).map((n) => n.student_id)).size;
      return { professores: professores ?? 0, avaliados };
    },
  });
}

function Painel() {
  const { data: me } = useMe();
  const { data: inst } = useInstituicao();
  const { data: alunos } = useAlunos();
  const { data: disc } = useDisciplinas();
  const { data: cont } = useContadores();
  const m = alunos?.filter((a) => a.genero === "M").length ?? 0;
  const stats = [
    { l: "Alunos matriculados", v: alunos?.length ?? 0, icon: GraduationCap },
    { l: "Masculino / Feminino", v: `${m} / ${(alunos?.length ?? 0) - m}`, icon: Users },
    { l: "Professores", v: cont?.professores ?? 0, icon: UserRound },
    { l: "Alunos avaliados", v: cont?.avaliados ?? 0, icon: ClipboardCheck },
    { l: "Disciplinas registadas", v: disc?.length ?? 0, icon: BookOpen },
    { l: "Ano lectivo", v: inst?.ano_lectivo ?? "", icon: CalendarDays },
  ];
  if (me?.isEncarregado) return <p>Sem permissão.</p>;
  return (
    <div>
      <div className="mb-6"><PageTitle title={`Bem-vindo(a), ${me?.profile?.nome ?? ""}`} /><p className="-mt-4 text-sm text-muted-foreground">{me?.papeis.map((p) => NOMES_PAPEL[p]).join(", ")}</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.l}><CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between"><div className="text-sm text-muted-foreground">{s.l}</div><s.icon className="h-6 w-6 text-primary/70" /></div>
            <div className="text-3xl font-semibold text-primary">{s.v}</div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
