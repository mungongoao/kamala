import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAlunos, useDisciplinas, useMe, useNotasClasse } from "@/lib/dados";
import {
  QUALITATIVOS, escalaMax, fmt, isClasseExame, isQualitativa, mediaTrimestral, nomeClasse, notaMinima, temExameOral,
} from "@/lib/avaliacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { turmaPermitida } from "@/lib/gestao";
import { TurmaSelect } from "@/components/turma-select";
import { ClasseSelect, PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/notas")({
  head: () => ({ meta: [{ title: "Lançar Notas — KAMALA" }, { name: "description", content: "Lançamento de notas por disciplina." }] }),
  component: Notas,
});

type Linha = { mac: string; npt: string; qualitativo: string; exame_escrito: string; exame_oral: string; faltas: string };
const vazia: Linha = { mac: "", npt: "", qualitativo: "", exame_escrito: "", exame_oral: "", faltas: "0" };

function Notas() {
  const { data: me } = useMe();
  const [classe, setClasse] = useState("1");
  const [turma, setTurma] = useState("todas");
  const [disc, setDisc] = useState("");
  const [tri, setTri] = useState("1");
  const { data: disciplinas } = useDisciplinas(classe);
  const { data: alunos } = useAlunos(classe);
  const { data: notas } = useNotasClasse(classe);
  const { data: atrib } = useQuery({
    queryKey: ["atribuicoes", me?.id],
    enabled: !!me && !me.isStaff && !me.isCoordenador,
    queryFn: async () => (await supabase.from("teacher_assignments").select("subject_id,turmas").eq("user_id", me?.id ?? "")).data ?? [],
  });
  const qc = useQueryClient();
  const [linhas, setLinhas] = useState<Record<number, Linha>>({});

  const permitidas = useMemo(
    () => (disciplinas ?? []).filter((d) => me?.isStaff || me?.isCoordenador || atrib?.some((a) => a.subject_id === d.id)),
    [disciplinas, atrib, me],
  );
  const visiveis = useMemo(() => (alunos ?? []).filter(a => (turma === "todas" || a.turma === turma) && (me?.isStaff || me?.isCoordenador || turmaPermitida(atrib ?? [], disc, a.turma))), [alunos,turma,me,atrib,disc]);
  const disciplina = permitidas.find((d) => d.id === disc);
  const max = escalaMax(classe);
  const qual = isQualitativa(classe);
  const comExame = isClasseExame(classe) && tri === "3";
  const oral = comExame && disciplina ? temExameOral(disciplina.nome) : false;
  const podeLancarNotas = !!me && (me.isStaff || me.isProfessor);

  useEffect(() => { setDisc(""); }, [classe]);
  useEffect(() => {
    const m: Record<number, Linha> = {};
    for (const a of visiveis) {
      const n = notas?.find((x) => x.student_id === a.id && x.subject_id === disc && x.trimestre === Number(tri));
      m[a.id] = n
        ? { mac: n.mac?.toString() ?? "", npt: n.npt?.toString() ?? "", qualitativo: n.qualitativo ?? "", exame_escrito: n.exame_escrito?.toString() ?? "", exame_oral: n.exame_oral?.toString() ?? "", faltas: String(n.faltas ?? 0) }
        : { ...vazia };
    }
    setLinhas(m);
  }, [visiveis, notas, disc, tri]);

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  async function guardar() {
    if (!disciplina) return;
    const rows = [];
    for (const a of visiveis) {
      const l = linhas[a.id] ?? vazia;
      const vals: (number | null)[] = [num(l.mac), num(l.npt), num(l.exame_escrito), num(l.exame_oral)];
      if (vals.some((v) => v != null && (isNaN(v) || v < 0 || v > max)))
        return void toast.error(`Nota inválida para ${a.nome}. Escala: 0 a ${max}.`);
      rows.push({
        student_id: a.id, subject_id: disciplina.id, trimestre: Number(tri),
        mac: qual ? null : vals[0] ?? null, npt: qual ? null : isClasseExame(classe) && tri === "3" ? (notas?.find((n) => n.student_id === a.id && n.subject_id === disciplina.id && n.trimestre === Number(tri))?.npt ?? null) : vals[1] ?? null,
        qualitativo: qual ? l.qualitativo || null : null,
        exame_escrito: comExame ? vals[2] ?? null : null, exame_oral: oral ? vals[3] ?? null : null,
        faltas: me?.podeLancarFaltas ? Math.max(0, parseInt(l.faltas) || 0) : Number(notas?.find((n) => n.student_id === a.id && n.subject_id === disciplina.id && n.trimestre === Number(tri))?.faltas ?? 0),
        updated_at: new Date().toISOString(),
      });
    }
    if (!rows.length) return;
    const { error } = await supabase.from("grades").upsert(rows, { onConflict: "student_id,subject_id,trimestre" });
    if (error) return void toast.error("Não foi possível guardar: " + error.message);
    toast.success("Notas guardadas. Mini-pauta e pautas actualizadas.");
    qc.invalidateQueries({ queryKey: ["notas", classe] });
  }

  const upd = (id: number, k: keyof Linha, v: string) => setLinhas({ ...linhas, [id]: { ...(linhas[id] ?? vazia), [k]: v } });

  if (me?.isEncarregado) return <p>Sem permissão.</p>;

  return (
    <div>
      <PageTitle title="Lançamento de Notas">
        <ClasseSelect value={classe} onChange={v => {setClasse(v);setTurma("todas");}} /><TurmaSelect alunos={visiveis.length ? visiveis : alunos ?? []} value={turma} onChange={setTurma} />
        <Select value={disc} onValueChange={setDisc}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Disciplina" /></SelectTrigger>
          <SelectContent>{permitidas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}{d.extra ? " (extra)" : ""}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={tri} onValueChange={setTri}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{["1", "2", "3"].map((t) => <SelectItem key={t} value={t}>{t}º Trimestre</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={guardar} disabled={!disciplina}>Salvar notas na pauta trimestral</Button>
      </PageTitle>
      {!disciplina ? (
        <p className="text-muted-foreground">
          {permitidas.length === 0 ? "Não há disciplinas disponíveis para si nesta classe." : "Escolha a disciplina."}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {nomeClasse(classe)} · {disciplina.nome} · {qual ? "Avaliação qualitativa" : isClasseExame(classe) && tri === "3" ? `Escala 0–${max} · MT3 = MACT3` : `Escala 0–${max} · MT${tri} = (MAC + NPT) / 2`}
            {comExame && " · Inclui Exame escrito" + (oral ? " e oral" : "")}
          </p>
          <div className="overflow-auto rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr className="text-left">
                  <th className="p-2">Nº</th><th className="p-2">Nome do Aluno</th>
                  {qual ? <th className="p-2">Avaliação</th> : isClasseExame(classe) && tri === "3" ? <th className="p-2">MACT3</th> : <><th className="p-2">MAC</th><th className="p-2">NPT</th><th className="p-2">MT{tri}</th></>}
                  {comExame && <th className="p-2">Exame Escrito</th>}
                  {oral && <th className="p-2">Exame Oral</th>}
                  <th className="p-2">Faltas</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((a, i) => {
                  const l = linhas[a.id] ?? vazia;
                  const mt = mediaTrimestral({ mac: num(l.mac), npt: num(l.npt), trimestre: Number(tri) }, classe);
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="p-2">{i + 1}</td><td className="p-2">{a.nome}</td>
                      {qual ? (
                        <td className="p-2">
                          <Select disabled={!podeLancarNotas} value={l.qualitativo} onValueChange={(v) => upd(a.id, "qualitativo", v)}>
                            <SelectTrigger className="w-36"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>{QUALITATIVOS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                      ) : (
                        <>
                          {isClasseExame(classe) && tri === "3" ? (
                            <td className="p-2"><Input disabled={!podeLancarNotas} className="w-20" value={l.mac} onChange={(e) => upd(a.id, "mac", e.target.value)} /></td>
                          ) : <>
                            <td className="p-2"><Input disabled={!podeLancarNotas} className="w-20" value={l.mac} onChange={(e) => upd(a.id, "mac", e.target.value)} /></td>
                            <td className="p-2"><Input disabled={!podeLancarNotas} className="w-20" value={l.npt} onChange={(e) => upd(a.id, "npt", e.target.value)} /></td>
                          </>}
                          <td className={`p-2 font-semibold ${mt == null ? "" : mt < notaMinima(classe) ? "neg" : "pos"}`}>{fmt(mt)}</td>
                        </>
                      )}
                      {comExame && <td className="p-2"><Input disabled={!podeLancarNotas} className="w-20" value={l.exame_escrito} onChange={(e) => upd(a.id, "exame_escrito", e.target.value)} /></td>}
                      {oral && <td className="p-2"><Input disabled={!podeLancarNotas} className="w-20" value={l.exame_oral} onChange={(e) => upd(a.id, "exame_oral", e.target.value)} /></td>}
                      <td className="p-2"><Input className="w-16" type="number" min={0} disabled={!me?.podeLancarFaltas} value={l.faltas} onChange={(e) => upd(a.id, "faltas", e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
