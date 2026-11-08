import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAlunos, useInstituicao, useMe, type Aluno } from "@/lib/dados";
import { alunoSchema, TURMAS } from "@/lib/gestao";
import { GuardarDocumento } from "@/components/guardar-documento";
import { nomeClasse } from "@/lib/avaliacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClasseSelect, DocCabecalho, PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/alunos")({
 head: () => ({ meta: [{ title: "Cadastro de Alunos — KAMALA" }, { name: "description", content: "Cadastro e actualização dos alunos da instituição." }, { property: "og:title", content: "Cadastro de Alunos — KAMALA" }, { property: "og:description", content: "Cadastro e actualização dos alunos da instituição." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Alunos,
});
const vazio = { nome: "", genero: "M", classe: "1", turma: "A", estado: "Activo" };
function Alunos() {
 const { data: me } = useMe(); const { data: alunos = [] } = useAlunos(); const { data: inst } = useInstituicao(); const qc = useQueryClient();
 const [f, setF] = useState(vazio); const [editId, setEditId] = useState<number | null>(null); const [eliminarId, setEliminarId] = useState<number | null>(null);
 const [busy, setBusy] = useState(false); const [pag, setPag] = useState(0); const [busca, setBusca] = useState(""); const [ficha, setFicha] = useState<Aluno | null>(null);
 const ordenados = useMemo(() => alunos.slice().sort((a,b) => a.id-b.id).filter(a => a.nome.toLowerCase().includes(busca.toLowerCase())), [alunos,busca]);
 const total = Math.max(1, Math.ceil(ordenados.length / 15)); const pagina = ordenados.slice(pag*15,(pag+1)*15);
 const limpar = () => { setEditId(null); setF({ ...vazio, classe: f.classe }); };
 function imprimirFicha(a: Aluno) {
  setFicha(a);
  const anterior = document.title;
  document.title = `Ficha - ${a.nome} - ${nomeClasse(a.classe)}`;
  window.setTimeout(() => {
   window.addEventListener("afterprint", () => { document.title = anterior; }, { once: true });
   window.print();
  }, 0);
 }
 async function guardar(e: React.FormEvent) {
  e.preventDefault(); const p = alunoSchema.safeParse(f); if (!p.success) return void toast.error(p.error.issues[0]?.message); setBusy(true);
  const { error } = editId === null ? await supabase.from("students").insert(p.data) : await supabase.from("students").update(p.data).eq("id",editId);
  setBusy(false); if(error) return void toast.error(error.message); toast.success(editId === null ? "Aluno cadastrado." : "Dados do aluno actualizados."); limpar(); await qc.invalidateQueries();
 }
 async function eliminar() { if(eliminarId === null) return; const { error } = await supabase.from("students").update({ deleted_at: new Date().toISOString() }).eq("id",eliminarId); if(error) return void toast.error(error.message); toast.success("Aluno enviado para o Lixo. Pode restaurá-lo durante 15 dias."); if(editId === eliminarId) limpar(); setEliminarId(null); await qc.invalidateQueries(); }
 function editar(a: Aluno) { setEditId(a.id); setF({ nome:a.nome,genero:a.genero,classe:a.classe,turma:a.turma,estado:a.estado }); window.scrollTo({ top:0,behavior:"smooth" }); }
 if(!me?.isStaff) return <p>Sem permissão.</p>;
 return <div><PageTitle title={editId === null ? "Cadastro de Alunos" : "Actualização de Dados"} />
 <form onSubmit={guardar} className="mb-6 grid gap-3 border-b pb-6 sm:grid-cols-2 lg:grid-cols-4">
 {editId !== null && <div><Label htmlFor="aluno-id">ID</Label><Input id="aluno-id" value={editId} readOnly /></div>}
 <div className="sm:col-span-2"><Label htmlFor="aluno-nome">Nome do aluno</Label><Input id="aluno-nome" value={f.nome} onChange={e=>setF({...f,nome:e.target.value})} required /></div>
 <div><Label>Género</Label><Select value={f.genero} onValueChange={v=>setF({...f,genero:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="M">Masculino</SelectItem><SelectItem value="F">Feminino</SelectItem></SelectContent></Select></div>
 <div><Label>Classe</Label><ClasseSelect value={f.classe} onChange={v=>setF({...f,classe:v})} className="w-full" /></div>
 <div><Label>Turma</Label><Select value={f.turma} onValueChange={v=>setF({...f,turma:v})}><SelectTrigger aria-label="Turma"><SelectValue /></SelectTrigger><SelectContent>{TURMAS.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
 <div><Label>Estado</Label><Select value={f.estado} onValueChange={v=>setF({...f,estado:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Activo">Activo</SelectItem><SelectItem value="Desistente">Desistente</SelectItem></SelectContent></Select></div>
 <div className="flex flex-wrap items-end gap-2"><Button disabled={busy}>{editId === null ? "Cadastrar aluno" : "Atualizar Dados"}</Button>{editId !== null && <Button type="button" variant="outline" onClick={limpar}>Cancelar</Button>}</div></form>
 <Input placeholder="Pesquisar por nome…" value={busca} onChange={e=>{setBusca(e.target.value);setPag(0);}} className="mb-3 max-w-sm" />
 <Table><TableHeader><TableRow>{["ID","Nome do Aluno","Género","Classe","Turma","Estado","Acções"].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{pagina.map(a=><TableRow key={a.id}><TableCell>{a.id}</TableCell><TableCell>{a.nome}</TableCell><TableCell>{a.genero}</TableCell><TableCell>{nomeClasse(a.classe)}</TableCell><TableCell>{a.turma}</TableCell><TableCell>{a.estado}</TableCell><TableCell><div className="flex gap-1"><Button size="sm" variant="outline" onClick={()=>editar(a)}><Pencil className="h-4 w-4" />Editar</Button><Button size="sm" variant="destructive" onClick={()=>setEliminarId(a.id)}><Trash2 className="h-4 w-4" />Eliminar</Button><Button size="icon" variant="ghost" title="Imprimir ficha" onClick={()=>imprimirFicha(a)}><Printer className="h-4 w-4" /></Button><GuardarDocumento selector=".ficha-doc" nome={`Ficha - ${a.nome} - ${nomeClasse(a.classe)}`} preparar={()=>setFicha(a)} /></div></TableCell></TableRow>)}{!pagina.length && <TableRow><TableCell colSpan={7}>Sem alunos.</TableCell></TableRow>}</TableBody></Table>
 <div className="mt-4 flex items-center gap-3 text-sm"><Button variant="outline" disabled={!pag} onClick={()=>setPag(pag-1)}>Anterior</Button>Página {pag+1} de {total}<Button variant="outline" disabled={pag+1>=total} onClick={()=>setPag(pag+1)}>Seguinte</Button></div>
 <AlertDialog open={eliminarId!==null} onOpenChange={o=>!o&&setEliminarId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar este aluno?</AlertDialogTitle><AlertDialogDescription>O aluno será enviado para o Lixo e poderá ser restaurado durante 15 dias. Depois será eliminado definitivamente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Não</AlertDialogCancel><AlertDialogAction onClick={eliminar}>Sim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 {ficha && <div className="print-area hidden print:block"><div className="doc doc-a4 ficha-doc mx-auto"><DocCabecalho inst={inst} titulo="Ficha do Aluno" sub={`Ano lectivo ${inst?.ano_lectivo??""}`} /><table className="mt-8"><tbody>{[["ID",ficha.id],["Nome do Aluno",ficha.nome],["Género",ficha.genero],["Classe",nomeClasse(ficha.classe)],["Turma",ficha.turma],["Estado",ficha.estado]].map(([k,v])=><tr key={k}><th>{k}</th><td className="esq">{v}</td></tr>)}</tbody></table></div></div>}
 </div>;
}
