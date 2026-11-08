import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAlunos, useDisciplinas, useInstituicao, useMe, type Aluno, type NotaRow } from "@/lib/dados";
import {
  CLASSES, cicloDe, fmt, isQualitativa, mediaTrimestral, nomeClasse, notaMinima,
  resultadoFinal, resultadoTrimestreDetalhado, resumoDisciplina,
} from "@/lib/avaliacao";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocCabecalho, PageTitle } from "@/components/escola";
import { percentagem } from "@/lib/gestao";
import { GuardarDocumento } from "@/components/guardar-documento";

export const Route = createFileRoute("/_authenticated/estatisticas")({
  head: () => ({ meta: [{ title: "Estatísticas — KAMALA" }, { name: "description", content: "Estatísticas por classe e mapa estatístico do professor." }] }),
  component: Estatisticas,
});

function useTodasNotas() {
  return useQuery({
    queryKey: ["notas-todas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grades").select("*");
      if (error) throw error;
      return (data ?? []) as NotaRow[];
    },
  });
}

type Contagem = { mf: number; f: number };
const contar = (lista: Aluno[]): Contagem => ({ mf: lista.length, f: lista.filter((a) => a.genero === "F").length });

function Estatisticas() {
  const { data: me } = useMe();
  const [vista, setVista] = useState("classe");
  const [tri, setTri] = useState("final");
  const { data: inst } = useInstituicao();
  const { data: alunos = [] } = useAlunos();
  const { data: disciplinas = [] } = useDisciplinas();
  const { data: notas = [] } = useTodasNotas();
  const { data: profs = [] } = useQuery({
    queryKey: ["stats-professores"],
    enabled: !!me?.isStaff,
    queryFn: async () => (await supabase.rpc("staff_teacher_statistics")).data ?? [],
  });
  const { data: atribuicoes = [] } = useQuery({
    queryKey: ["atribuicoes-stats", me?.id],
    enabled: !!me?.isProfessor,
    queryFn: async () => (await supabase.from("teacher_assignments").select("subject_id,turmas, subjects(nome, classe)").eq("user_id", me?.id ?? "")).data ?? [],
  });

  const t = tri === "final" ? null : Number(tri);
  const resultadoAluno = (a: Aluno): string | null => {
    const discs = disciplinas.filter((d) => d.classe === a.classe);
    if (t == null) {
      const resumos = discs.map((d) => ({ extra: d.extra, r: resumoDisciplina(a.classe, d.nome, notas.filter((n) => n.student_id === a.id && n.subject_id === d.id)) }));
      return resultadoFinal(a.classe, resumos)?.texto ?? null;
    }
    const faltas = notas.filter((n) => n.student_id === a.id && n.trimestre === t).reduce((s, n) => s + (n.faltas ?? 0), 0);
    const medias = discs.map((d) => {
      const n = notas.find((x) => x.student_id === a.id && x.subject_id === d.id && x.trimestre === t);
      return { extra: d.extra, disciplina: d.nome, v: isQualitativa(a.classe) ? n?.qualitativo ?? null : mediaTrimestral(n) };
    });
    return resultadoTrimestreDetalhado(a.classe, medias, faltas);
  };

  const linhas = useMemo(() => CLASSES.map((c) => {
    const daClasse = alunos.filter((a) => a.classe === c);
    const activos = daClasse.filter((a) => a.estado === "Activo");
    const desistentes = daClasse.filter((a) => a.estado === "Desistente");
    const avaliados = activos.filter((a) => notas.some((n) => n.student_id === a.id && (t == null || n.trimestre === t)));
    const comApr = avaliados.filter((a) => { const r = resultadoAluno(a); return r === "Transita" || r === "Apto"; });
    const semApr = avaliados.filter((a) => { const r = resultadoAluno(a); return r === "Não Transita" || r === "Não Apto"; });
    const profsClasse = new Set(profs.filter((p) => disciplinas.some((d) => d.id === p.subject_id && d.classe === c)).map((p) => p.user_id));
    const generoProf = new Map(profs.map((p) => [p.user_id, p.genero]));
    const profLista = Array.from(profsClasse);
    return {
      classe: c, ciclo: cicloDe(c),
      turmas: new Set(activos.map((a) => a.turma)).size,
      professores: { mf: profLista.length, f: profLista.filter((id) => generoProf.get(id) === "F").length },
      matriculados: contar(activos), desistentes: contar(desistentes),
      avaliados: contar(avaliados), comApr: contar(comApr), semApr: contar(semApr),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [alunos, disciplinas, notas, profs, tri]);

  if (me?.isEncarregado || me?.isCoordenador) return <p>Sem permissão.</p>;
  const tituloTri = tri === "final" ? "Final" : `${tri}º Trimestre`;
  const nomeImpressao = `Estatísticas - ${tituloTri}`;
  function imprimir() {
    const anterior = document.title;
    document.title = nomeImpressao;
    window.addEventListener("afterprint", () => { document.title = anterior; }, { once: true });
    window.print();
  }
  const soma = (ls: typeof linhas, k: "matriculados" | "desistentes" | "avaliados" | "comApr" | "semApr" | "professores") =>
    ({ mf: ls.reduce((s, l) => s + l[k].mf, 0), f: ls.reduce((s, l) => s + l[k].f, 0) });
  const cel = (c: Contagem, base?: number) => <><td>{c.mf}</td><td>{c.f}</td>{base !== undefined && <td>{percentagem(c.mf, base)}%</td>}</>;

  return (
    <div>
      <PageTitle title="Estatísticas">
        {me?.isStaff && me?.isProfessor && (
          <Tabs value={vista} onValueChange={setVista}>
            <TabsList><TabsTrigger value="classe">Por Classe</TabsTrigger><TabsTrigger value="professor">Mapa do Professor</TabsTrigger></TabsList>
          </Tabs>
        )}
        <Select value={tri} onValueChange={setTri}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["1", "2", "3"].map((x) => <SelectItem key={x} value={x}>{x}º Trimestre</SelectItem>)}
            <SelectItem value="final">Final</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
        <GuardarDocumento nome={nomeImpressao} />
      </PageTitle>

      {(vista === "classe" && me?.isStaff) || !me?.isProfessor ? (
        <div className="print-area overflow-auto">
          <div className="doc doc-a3 mx-auto shadow">
            <DocCabecalho inst={inst} titulo={`Estatísticas por Classe — ${tituloTri}`} sub={`Ano lectivo ${inst?.ano_lectivo ?? ""}`} />
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>Nível de ensino</th><th rowSpan={2}>Classe</th>
                  <th colSpan={2}>Professores</th><th rowSpan={2}>Turmas</th><th colSpan={2}>Matriculados</th>
                  <th colSpan={3}>Desistentes</th><th colSpan={3}>Avaliados</th><th colSpan={3}>Com Aproveitamento</th><th colSpan={3}>Sem Aproveitamento</th>
                </tr>
                <tr>{Array.from({ length: 6 }).map((_, i) => <Fragment key={i}><th>MF</th><th>F</th>{i >= 2 && <th>%</th>}</Fragment>)}</tr>
              </thead>
              <tbody>
                {["Educação Pré-Escolar", "Ensino Primário", "I Ciclo do Ensino Secundário"].map((ciclo) => {
                  const ls = linhas.filter((l) => l.ciclo === ciclo);
                  if (!ls.some((l) => l.matriculados.mf > 0)) return null;
                  return (
                    <Fragment key={ciclo}>
                      {ls.map((l, i) => (
                        <tr key={l.classe}>
                          {i === 0 && <td rowSpan={ls.length} className="esq"><b>{ciclo}</b></td>}
                          <td>{nomeClasse(l.classe)}</td>
                          {cel(l.professores)}<td>{l.turmas}</td>{cel(l.matriculados)}{cel(l.desistentes, l.matriculados.mf + l.desistentes.mf)}{cel(l.avaliados, l.matriculados.mf + l.desistentes.mf)}{cel(l.comApr, l.avaliados.mf)}{cel(l.semApr, l.avaliados.mf)}
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td colSpan={2}>Subtotal — {ciclo}</td>
                        {cel(soma(ls, "professores"))}<td>{ls.reduce((s, l) => s + l.turmas, 0)}</td>
                        {cel(soma(ls, "matriculados"))}{cel(soma(ls, "desistentes"), soma(ls, "matriculados").mf + soma(ls, "desistentes").mf)}{cel(soma(ls, "avaliados"), soma(ls, "matriculados").mf + soma(ls, "desistentes").mf)}{cel(soma(ls, "comApr"), soma(ls, "avaliados").mf)}{cel(soma(ls, "semApr"), soma(ls, "avaliados").mf)}
                      </tr>
                    </Fragment>
                  );
                })}
                <tr className="font-bold">
                  <td colSpan={2}>Total Geral</td>
                  {cel(soma(linhas, "professores"))}<td>{linhas.reduce((s, l) => s + l.turmas, 0)}</td>
                  {cel(soma(linhas, "matriculados"))}{cel(soma(linhas, "desistentes"), soma(linhas, "matriculados").mf + soma(linhas, "desistentes").mf)}{cel(soma(linhas, "avaliados"), soma(linhas, "matriculados").mf + soma(linhas, "desistentes").mf)}{cel(soma(linhas, "comApr"), soma(linhas, "avaliados").mf)}{cel(soma(linhas, "semApr"), soma(linhas, "avaliados").mf)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="print-area overflow-auto space-y-8">
          {atribuicoes.map((at) => {
            const classe = at.subjects?.classe ?? "";
            const min = notaMinima(classe);
            const daClasse = alunos.filter((a) => a.classe === classe && (!at.turmas.length || at.turmas.includes(a.turma)));
            const activos = daClasse.filter((a) => a.estado === "Activo");
            const notaDe = (a: Aluno) => {
              const ns = notas.filter((n) => n.student_id === a.id && n.subject_id === at.subject_id);
              return t == null ? resumoDisciplina(classe, at.subjects?.nome ?? "", ns).cf : mediaTrimestral(ns.find((n) => n.trimestre === t));
            };
            const avaliados = activos.filter((a) => notaDe(a) != null);
            const aprovados = avaliados.filter((a) => (notaDe(a) ?? 0) >= min);
            const reprovados = avaliados.filter((a) => (notaDe(a) ?? 0) < min);
            const desistentes = daClasse.filter((a) => a.estado === "Desistente");
            const linha = (descricao: string, lista: Aluno[]) => {
              const base = descricao === "Alunos Matriculados" ? lista.length : activos.length || 1;
              return (
                <tr key={descricao}>
                  <td className="esq">{descricao}</td><td>{lista.length}</td><td>{lista.filter((a) => a.genero === "F").length}</td>
                  <td>{fmt(Math.round((lista.length / base) * 100))}%</td>
                </tr>
              );
            };
            return (
              <div key={at.subject_id} className="doc doc-a4 mx-auto shadow">
                <DocCabecalho inst={inst} titulo="Mapa Estatístico do Professor" sub={`${at.subjects?.nome ?? ""} · ${nomeClasse(classe)} · Turmas ${at.turmas.join(", ") || "Todas"} · ${tituloTri} · Ano lectivo ${inst?.ano_lectivo ?? ""}`} />
                <table>
                  <thead><tr><th>Descrição</th><th>MF</th><th>F</th><th>%</th></tr></thead>
                  <tbody>
                    {linha("Alunos Matriculados", activos)}
                    {linha("Aprovados", aprovados)}
                    {linha("Reprovados", reprovados)}
                    {linha("Desistentes", desistentes)}
                  </tbody>
                </table>
              </div>
            );
          })}
          {me?.isProfessor && atribuicoes.length === 0 && <p className="text-muted-foreground">Ainda não tem disciplinas atribuídas.</p>}
        </div>
      )}
    </div>
  );
}
