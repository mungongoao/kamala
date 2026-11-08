import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GuardarDocumento } from "@/components/guardar-documento";
import { TurmaSelect } from "@/components/turma-select";
import { Printer } from "lucide-react";
import { useAlunos, useInstituicao, useMe, useFaltasClasse } from "@/lib/dados";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nomeClasse } from "@/lib/avaliacao";
import { Button } from "@/components/ui/button";
import { Assinatura, ClasseSelect, DocCabecalho, PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/lista-nominal")({
  head: () => ({ meta: [{ title: "Lista Nominal — KAMALA" }, { name: "description", content: "Lista nominal por classe." }] }),
  component: Lista,
});

function Lista() {
  const { data: me } = useMe();
  const [classe, setClasse] = useState("1");
  const { data: todos = [] } = useAlunos(classe);
  const [turma, setTurma] = useState("todas");
  const alunos = todos.filter((a) => turma === "todas" || a.turma === turma);
  const { data: inst } = useInstituicao();
  const qc = useQueryClient();
  const [tri, setTri] = useState("1");
  const { data: faltas = [] } = useFaltasClasse(classe);
  const [edit, setEdit] = useState<Record<number, string>>({});
  useEffect(() => setEdit({}), [classe, tri]);
  const podeF = !!me?.podeLancarFaltas;
  const valor = (id: number) => edit[id] ?? String(faltas.find((f) => f.student_id === id && f.trimestre === Number(tri))?.faltas ?? 0);
  async function guardarFaltas() {
    const rows = Object.entries(edit).map(([id, v]) => ({ student_id: Number(id), trimestre: Number(tri), faltas: Math.max(0, Math.round(Number(v) || 0)), updated_at: new Date().toISOString() }));
    if (!rows.length) return void toast.info("Sem alterações.");
    const { error } = await supabase.from("faltas_alunos").upsert(rows, { onConflict: "student_id,trimestre" });
    if (error) return void toast.error(error.message);
    toast.success("Faltas guardadas.");
    setEdit({});
    qc.invalidateQueries({ queryKey: ["faltas"] });
  }
  const m = alunos?.filter((a) => a.genero === "M").length ?? 0;
  const nomeImpressao = `Lista Nominal - ${nomeClasse(classe)} - Turma ${turma}`;
  function imprimir() {
    const anterior = document.title;
    document.title = nomeImpressao;
    window.addEventListener("afterprint", () => { document.title = anterior; }, { once: true });
    window.print();
  }
  if (me?.isEncarregado) return <p>Sem permissão.</p>;
  return (
    <div>
      <PageTitle title="Lista Nominal">
        <ClasseSelect value={classe} onChange={(v) => { setClasse(v); setTurma("todas"); }} /><TurmaSelect alunos={todos} value={turma} onChange={setTurma} /><GuardarDocumento nome={nomeImpressao} />
        <Select value={tri} onValueChange={setTri}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{["1","2","3"].map((t) => <SelectItem key={t} value={t}>{t}º Trimestre (faltas)</SelectItem>)}</SelectContent>
        </Select>
        {podeF && <Button onClick={guardarFaltas}>Guardar faltas</Button>}
        <Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
      </PageTitle>
      <div className="print-area overflow-auto">
        <div className="doc doc-a4 mx-auto shadow" >
          <DocCabecalho inst={inst} titulo="Lista Nominal" sub={`${nomeClasse(classe)} · Turma ${turma} · Ano lectivo ${inst?.ano_lectivo ?? ""}`} />
          <table>
            <thead><tr><th style={{ width: 40 }}>Nº</th><th>Nome do Aluno</th><th style={{ width: 70 }}>Género</th><th>Turma</th><th>Estado</th><th style={{ width: 80 }}>Faltas {tri}º T</th></tr></thead>
            <tbody>
              {alunos?.map((a, i) => (
                <tr key={a.id}><td>{i + 1}</td><td className="esq">{a.nome}</td><td>{a.genero}</td><td>{a.turma}</td><td>{a.estado}</td><td>{podeF ? <Input type="number" min={0} className="h-7 w-16 print:hidden" value={valor(a.id)} onChange={(e) => setEdit({ ...edit, [a.id]: e.target.value })} /> : null}<span className={podeF ? "hidden print:inline" : ""}>{valor(a.id)}</span></td></tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, marginTop: 6 }}>Total: {alunos?.length ?? 0} · M: {m} · F: {(alunos?.length ?? 0) - m}</p>
          <div className="mt-8 flex justify-around">
            <Assinatura cargo="O Pedagógico" nome={inst?.pauta_pedagogico} />
            <Assinatura cargo="A Direcção" nome={inst?.pauta_direccao} />
          </div>
        </div>
      </div>
    </div>
  );
}
