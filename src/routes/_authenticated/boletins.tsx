import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Printer, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { GuardarDocumento } from "@/components/guardar-documento";
import { useAlunos, useDisciplinas, useInstituicao, useMe, useNotasClasse, useFaltasClasse, type Aluno, type FaltaRow } from "@/lib/dados";
import {
  fmt, isClasseExame, isQualitativa, mediaGeral, mediaTrimestral, nomeClasse, notaMinima, resultadoFinal, resultadoTrimestreDetalhado, resumoDisciplina,
} from "@/lib/avaliacao";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Assinatura, ClasseSelect, DocCabecalho, PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/boletins")({
  head: () => ({ meta: [{ title: "Boletins — KAMALA" }, { name: "description", content: "Boletins trimestrais e final." }] }),
  component: Boletins,
});

function Boletins() {
  const { data: me } = useMe();
  const [classe, setClasse] = useState("1");
  const [tipo, setTipo] = useState("1");
  const [sel, setSel] = useState<number[]>([]);
  const [pesquisa, setPesquisa] = useState("");
  const { data: inst } = useInstituicao();
  const { data: disciplinas = [] } = useDisciplinas(classe);
  const { data: alunos = [] } = useAlunos(classe);
  const { data: notas = [] } = useNotasClasse(classe);
  const { data: faltasT = [] } = useFaltasClasse(classe);
  const toggle = (id: number) => setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length >= 10 ? (toast.error("Pode seleccionar no máximo 10 alunos."), p) : [...p, id]);
  const filtrados = pesquisa.trim() ? alunos.filter((a) => a.nome.toLowerCase().includes(pesquisa.trim().toLowerCase())) : alunos;
  const lista = alunos.filter((a) => sel.includes(a.id));
  const paginas = Array.from({ length: Math.ceil(lista.length / 2) }, (_, i) => lista.slice(i * 2, i * 2 + 2));
  const nomeImpressao = lista.length > 2
    ? `Boletim - ${nomeClasse(classe)}`
    : lista.length
      ? `Boletim - ${lista.map((a) => a.nome).join(" e ")} - ${nomeClasse(classe)}`
      : `Boletim - ${nomeClasse(classe)}`;
  function imprimir() {
    const anterior = document.title;
    document.title = nomeImpressao;
    window.addEventListener("afterprint", () => { document.title = anterior; }, { once: true });
    window.print();
  }
  if (me?.isEncarregado) return <p>Sem permissão.</p>;

  return (
    <div>
      <PageTitle title="Boletins de Notas">
        <ClasseSelect value={classe} onChange={(v) => { setClasse(v); setSel([]); }} />
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Iº Trimestre</SelectItem>
            <SelectItem value="2">IIº Trimestre</SelectItem>
            <SelectItem value="3">IIIº Trimestre</SelectItem>
            <SelectItem value="final">Boletim Final</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="w-56 pl-8" placeholder="Pesquisar aluno…" value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} />
        </div>
        {me?.podeImprimirBoletim && (
          <>
            <Button onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
            <GuardarDocumento nome={nomeImpressao} />
          </>
        )}
      </PageTitle>
      {!me?.podeImprimirBoletim && <p className="mb-4 text-sm text-muted-foreground print:hidden">Apenas os Coordenadores e o ADM podem imprimir boletins.</p>}
      <div className="mb-4 max-h-56 overflow-auto rounded-md border p-2 print:hidden">
        <p className="mb-2 text-xs text-muted-foreground">Seleccione até 10 alunos ({sel.length}/10). A impressão organiza dois boletins por folha A4 horizontal (até 5 folhas).</p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm"><Checkbox checked={sel.includes(a.id)} onCheckedChange={() => toggle(a.id)} />{a.nome}</label>
          ))}
        </div>
      </div>
      {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aluno seleccionado.</p>}
      <div className={me?.podeImprimirBoletim ? "print-area" : "print:hidden"}>
        {paginas.map((par, pagina) => (
          <div className="duo" key={pagina}>
            {par.map((a, i) => (
              <Boletim key={a.id} n={alunos.indexOf(a) + 1 || pagina * 2 + i + 1} aluno={a} classe={classe} tipo={tipo} inst={inst} disciplinas={disciplinas} notas={notas} faltasT={faltasT} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Boletim({ aluno, n, classe, tipo, inst, disciplinas, notas, faltasT }: {
  faltasT: FaltaRow[];
  aluno: Aluno; n: number; classe: string; tipo: string;
  inst: ReturnType<typeof useInstituicao>["data"];
  disciplinas: ReturnType<typeof useDisciplinas>["data"] & object;
  notas: ReturnType<typeof useNotasClasse>["data"] & object;
}) {
  const qual = isQualitativa(classe);
  const exame = isClasseExame(classe);
  const min = notaMinima(classe);
  const cls = (v: number | null) => (v == null ? "" : v < min ? "neg" : "pos");
  const nd = (sid: string) => notas.filter((x) => x.student_id === aluno.id && x.subject_id === sid);
  const titulo = tipo === "final" ? "Boletim Final" : `Boletim de Notas — ${["I", "II", "III"][Number(tipo) - 1]}º Trimestre`;

  let resultado: string | null = null;
  const linhas = disciplinas.map((d) => {
    const ns = nd(d.id);
    if (tipo === "final") return { d, r: resumoDisciplina(classe, d.nome, ns), n: undefined };
    return { d, r: null, n: ns.find((x) => x.trimestre === Number(tipo)) };
  });
  if (tipo === "final") resultado = resultadoFinal(classe, linhas.map((l) => ({ extra: l.d.extra, r: l.r! })))?.texto ?? null;
  const faltas = notas.filter((x) => x.student_id === aluno.id && (tipo === "final" || x.trimestre === Number(tipo))).reduce((s, x) => s + (x.faltas ?? 0), 0)
    + faltasT.filter((x) => x.student_id === aluno.id && (tipo === "final" || x.trimestre === Number(tipo))).reduce((s, x) => s + x.faltas, 0);
  if (tipo !== "final") resultado = resultadoTrimestreDetalhado(classe, linhas.map((l) => ({ extra: l.d.extra, disciplina: l.d.nome, v: qual ? l.n?.qualitativo ?? null : mediaTrimestral(l.n, classe) })), faltas);
  const mediaFinal = qual ? null : mediaGeral(linhas.map((l) => ({ extra: l.d.extra, v: tipo === "final" ? l.r!.mf : mediaTrimestral(l.n, classe) })));

  return (
    <div className="doc doc-a5 shadow">
      <div className="boletim-header">
        <div className="boletim-visto"><Assinatura cargo="Visto pelo Diretor" nome={inst?.pauta_pedagogico} /></div>
        <div className="boletim-instituicao text-center" style={{ fontSize: 12 }}>
          {inst?.logo_url && <img src={inst.logo_url} alt="" style={{ height: 40, margin: "0 auto 4px" }} />}
          <div style={{ fontWeight: 700, fontSize: 13 }}>{inst?.nome_escola}</div>
          <div>Ano lectivo {inst?.ano_lectivo ?? ""}</div>
          <div style={{ fontWeight: 700, marginTop: 6, fontSize: 13, textTransform: "uppercase" }}>{titulo}</div>
        </div>
      </div>
      <div style={{ fontSize: 11, marginBottom: 6 }}>
        <div><b>Nome:</b> <span className="text-grade-negative font-semibold">{aluno.nome}</span></div>
        <div><b>Classe:</b> {classe === "INIC" ? "Iniciação" : `${classe}ª`} &nbsp; <b>Nº:</b> {n} &nbsp; <b>Género:</b> {aluno.genero}</div>
      </div>
      <table>
        <thead>
          {tipo === "final" ? (
            <tr><th>Disciplina</th>{qual ? <th>Avaliação</th> : exame ? <><th>NE</th><th>MFD</th><th>MF</th><th>Observação</th></> : <><th>MT1</th><th>MT2</th><th>MT3</th><th>MFD</th></>}</tr>
          ) : (
            <tr><th>Disciplina</th>{qual ? <th>Avaliação</th> : isClasseExame(classe) && tipo === "3" ? <><th>MACT3</th><th>MT3</th></> : <><th>MAC</th><th>NPT</th><th>MT{tipo}</th></>}</tr>
          )}
        </thead>
        <tbody>
          {linhas.map(({ d, r, n: nn }) => (
            <tr key={d.id}>
              <td className="esq">{d.nome}{d.extra ? "*" : ""}</td>
              {tipo === "final" ? (
                qual ? <td>{r!.qual ?? "—"}</td> : <>
                  {exame
                    ? <><td className={cls(r!.exame)}>{fmt(r!.exame)}</td><td className={cls(r!.mfd)}>{fmt(r!.mfd)}</td><td className={cls(r!.mf)}><b>{fmt(r!.mf)}</b></td><td>{r!.positiva == null ? "—" : r!.positiva ? "Apto" : "Não Apto"}</td></>
                    : <><td className={cls(r!.mt1)}>{fmt(r!.mt1)}</td><td className={cls(r!.mt2)}>{fmt(r!.mt2)}</td><td className={cls(r!.mt3)}>{fmt(r!.mt3)}</td><td className={cls(r!.mfd)}><b>{fmt(r!.mfd)}</b></td></>}
                </>
              ) : (
                <>
                  {qual ? <td>{nn?.qualitativo ?? "—"}</td> : <>
                    {isClasseExame(classe) && tipo === "3"
                      ? <><td className={cls(nn?.mac ?? null)}>{fmt(nn?.mac)}</td><td className={cls(mediaTrimestral(nn, classe))}><b>{fmt(mediaTrimestral(nn, classe))}</b></td></>
                      : <><td className={cls(nn?.mac ?? null)}>{fmt(nn?.mac)}</td><td className={cls(nn?.npt ?? null)}>{fmt(nn?.npt)}</td><td className={cls(mediaTrimestral(nn, classe))}><b>{fmt(mediaTrimestral(nn, classe))}</b></td></>}
                  </>}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, marginTop: 6 }}>
        <div><b>Total de Faltas:</b> {faltas}</div>
        <div><b>Resultado:</b> <b className={resultado ? (resultado.startsWith("Não") ? "neg" : "pos") : ""}>{resultado ?? "—"}</b></div>
        {mediaFinal != null && <div><b>Média:</b> <b className={cls(mediaFinal)}>{fmt(mediaFinal)}</b></div>}
        {disciplinas.some((d) => d.extra) && <div style={{ fontSize: 9 }}>* Extra-curricular (não conta para o resultado).</div>}
      </div>
      <div className="mt-6 flex justify-center">
        {classe === "INIC" || Number(classe) <= 5
          ? <Assinatura cargo="O Coordenador da Manhã" nome={inst?.boletim_coord_manha} />
          : <Assinatura cargo="O Coordenador da Tarde" nome={inst?.boletim_coord_tarde} />}
      </div>
    </div>
  );
}
