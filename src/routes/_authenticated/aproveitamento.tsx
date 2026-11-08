import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, CalendarX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isQualitativa, mediaTrimestral, notaMinima } from "@/lib/avaliacao";
import { useMe, type NotaRow } from "@/lib/dados";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/aproveitamento")({
  head: () => ({ meta: [
    { title: "Aproveitamento dos Educandos — KAMALA" },
    { name: "description", content: "Aproveitamento e faltas dos educandos associados." },
    { property: "og:title", content: "Aproveitamento dos Educandos — KAMALA" },
    { property: "og:description", content: "Consulta protegida do aproveitamento e das faltas dos educandos." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Aproveitamento,
});

function Aproveitamento() {
  const { data: me } = useMe();
  const { data: educandos = [] } = useQuery({
    queryKey: ["meus-educandos", me?.id],
    enabled: !!me?.isEncarregado,
    queryFn: async () => {
      const { data: ligacoes, error } = await supabase.from("guardian_students").select("student_id, students(id,nome,classe)").eq("guardian_id", me?.id ?? "");
      if (error) throw error;
      return (ligacoes ?? []).flatMap((l) => l.students ? [l.students] : []);
    },
  });
  const ids = educandos.map((a) => a.id);
  const { data: notas = [] } = useQuery({
    queryKey: ["notas-educandos", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("grades").select("*").in("student_id", ids);
      if (error) throw error;
      return data as NotaRow[];
    },
  });

  if (!me?.isEncarregado) return <p>Sem permissão.</p>;
  return (
    <div>
      <PageTitle title="Aproveitamento dos Educandos" />
      {educandos.length === 0 && <p className="text-muted-foreground">Ainda não há educandos associados à sua conta.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {educandos.map((aluno) => {
          const registos = notas.filter((n) => n.student_id === aluno.id);
          const porDisciplina = [...new Set(registos.map((n) => n.subject_id))].map((subjectId) => {
            const recentes = registos.filter((n) => n.subject_id === subjectId).sort((a, b) => b.trimestre - a.trimestre);
            return recentes.find((n) => isQualitativa(aluno.classe) ? !!n.qualitativo : mediaTrimestral(n) != null);
          });
          const avaliadas = porDisciplina.filter((n): n is NotaRow => !!n);
          const positivas = avaliadas.filter((n) => isQualitativa(aluno.classe) ? !!n.qualitativo : (mediaTrimestral(n) ?? 0) >= notaMinima(aluno.classe)).length;
          const percentagem = avaliadas.length ? Math.round((positivas / avaliadas.length) * 100) : 0;
          const faltas = registos.reduce((total, n) => total + (n.faltas ?? 0), 0);
          return <Card key={aluno.id}>
            <CardHeader><CardTitle>{aluno.nome}</CardTitle><p className="text-sm text-muted-foreground">{aluno.classe === "INIC" ? "Iniciação" : `${aluno.classe}.ª Classe`}</p></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="border-l-4 border-primary pl-3"><BookOpenCheck className="mb-2 h-5 w-5 text-primary" /><div className="text-3xl font-semibold">{percentagem}%</div><div className="text-sm text-muted-foreground">Aproveitamento</div></div>
              <div className="border-l-4 border-destructive pl-3"><CalendarX className="mb-2 h-5 w-5 text-destructive" /><div className="text-3xl font-semibold">{faltas}</div><div className="text-sm text-muted-foreground">Faltas</div></div>
            </CardContent>
          </Card>;
        })}
      </div>
    </div>
  );
}