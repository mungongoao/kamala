import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { eliminarUsuario } from "@/lib/usuarios.functions";
import { NOMES_PAPEL, useAlunos, useDisciplinas, useMe, type Papel } from "@/lib/dados";
import { nomeClasse } from "@/lib/avaliacao";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/utilizadores")({
  head: () => ({ meta: [{ title: "Utilizadores — KAMALA" }, { name: "description", content: "Gestão de utilizadores." }] }),
  component: Utilizadores,
});

function Utilizadores() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const eliminar = useServerFn(eliminarUsuario);
  const [cargo, setCargo] = useState<Record<string, Papel>>({});
  const [atribuir, setAtribuir] = useState<{ id: string; nome: string; tipo: "disciplinas" | "educandos" } | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["utilizadores"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      let { data: p, error: perfilError } = await supabase.from("profiles").select("*").is("deleted_at", null).order("created_at");
      // Compatibilidade com bases onde a migração do Lixo ainda não foi aplicada.
      if (perfilError) {
        const fallback = await supabase.from("profiles").select("*").order("created_at");
        p = fallback.data;
        perfilError = fallback.error;
      }
      if (perfilError) throw perfilError;
      const { data: r, error: rolesError } = await supabase.from("user_roles").select("*");
      if (rolesError) throw rolesError;
      return (p ?? []).map((u) => ({ ...u, papeis: (r ?? []).filter((x) => x.user_id === u.id).map((x) => x.role as Papel) }));
    },
  });

  if (!me?.isStaff) return <p>Sem permissão.</p>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["utilizadores"] });

  async function credenciar(id: string, def: string) {
    const role = cargo[id] ?? (def as Papel);
    const { error } = await supabase.rpc("credenciar_usuario", { _uid: id, _role: role });
    if (error) return void toast.error(error.message);
    toast.success("Utilizador credenciado."); refresh();
  }
  async function revogar(id: string) {
    const { error } = await supabase.rpc("revogar_usuario", { _uid: id });
    if (error) return void toast.error(error.message);
    toast.success("Acesso revogado."); refresh();
  }
  async function apagar(id: string) {
    if (!confirm("Eliminar definitivamente este utilizador?")) return;
    try { await eliminar({ data: { id } }); toast.success("Utilizador eliminado."); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const papeisDisponiveis: Papel[] = me.isAdmin ? ["admin", "pedagogico", "coordenador", "professor", "encarregado"] : ["pedagogico", "coordenador", "professor", "encarregado"];

  return (
    <div>
      <PageTitle title="Gestão de Utilizadores"><Button variant="outline" onClick={() => window.location.assign("/lixo")}>Lixo</Button></PageTitle>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Estado</TableHead><TableHead>Cargo</TableHead><TableHead className="text-right">Acções</TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map((u) => {
            const atual = u.papeis[0] ?? (u.cargo_pretendido as Papel);
            const protegido = u.papeis.includes("admin") && !me.isAdmin;
            return (
              <TableRow key={u.id}>
                <TableCell>{u.nome}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.status === "APROVADO" ? "default" : u.status === "REVOGADO" ? "destructive" : "secondary"}>{u.status}</Badge>
                </TableCell>
                <TableCell>
                  {u.id === me.id || protegido ? NOMES_PAPEL[atual] : (
                    <Select value={cargo[u.id] ?? atual} onValueChange={(v) => setCargo({ ...cargo, [u.id]: v as Papel })}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>{papeisDisponiveis.map((p) => <SelectItem key={p} value={p}>{NOMES_PAPEL[p]}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <div className="flex flex-nowrap items-center justify-end gap-2">
                    {u.id !== me.id && !protegido && (
                      <>
                        <Button size="sm" onClick={() => credenciar(u.id, atual)}>{u.status === "APROVADO" ? "Actualizar" : "Credenciar"}</Button>
                        {u.status === "APROVADO" && <Button size="sm" variant="outline" onClick={() => revogar(u.id)}>Revogar</Button>}
                        {u.papeis.includes("professor") && u.status === "APROVADO" && (
                          <Button size="sm" variant="secondary" onClick={() => setAtribuir({ id: u.id, nome: u.nome, tipo: "disciplinas" })}>Disciplinas</Button>
                        )}
                        {u.papeis.includes("encarregado") && u.status === "APROVADO" && (
                          <Button size="sm" variant="secondary" onClick={() => setAtribuir({ id: u.id, nome: u.nome, tipo: "educandos" })}>Educandos</Button>
                        )}
                        {me.isAdmin && <Button size="sm" variant="destructive" onClick={() => apagar(u.id)}>Eliminar</Button>}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {atribuir?.tipo === "disciplinas" && <Atribuicoes user={atribuir} onClose={() => setAtribuir(null)} />}
      {atribuir?.tipo === "educandos" && <Educandos user={atribuir} onClose={() => setAtribuir(null)} />}
    </div>
  );
}

function Educandos({ user, onClose }: { user: { id: string; nome: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: alunos = [] } = useQuery({ queryKey: ["alunos-para-encarregado"], queryFn: async () => (await supabase.from("students").select("id,nome,classe").order("nome")).data ?? [] });
  const { data: ligacoes = [] } = useQuery({ queryKey: ["educandos", user.id], queryFn: async () => (await supabase.from("guardian_students").select("student_id").eq("guardian_id", user.id)).data ?? [] });
  async function toggle(studentId: number, on: boolean) {
    const { error } = on
      ? await supabase.from("guardian_students").insert({ guardian_id: user.id, student_id: studentId })
      : await supabase.from("guardian_students").delete().eq("guardian_id", user.id).eq("student_id", studentId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["educandos", user.id] });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader><DialogTitle>Educandos de {user.nome}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {alunos.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><Checkbox checked={ligacoes.some((l) => l.student_id === a.id)} onCheckedChange={(v) => toggle(a.id, !!v)} />{a.nome} — {nomeClasse(a.classe)}</label>)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Atribuicoes({ user, onClose }: { user: { id: string; nome: string }; onClose: () => void }) {
  const { data: disc = [] } = useDisciplinas();
  const { data: alunos = [] } = useAlunos();
  const [ciclo, setCiclo] = useState("");
  const [classe, setClasse] = useState("");
  const [busy, setBusy] = useState(false);
  const classes = ciclo === "primario" ? ["INIC", "1", "2", "3", "4", "5", "6"] : ["7", "8", "9"];
  const listadas = disc.filter(d => classe === "todas" ? classes.includes(d.classe) : d.classe === classe);
  const qc = useQueryClient();
  const { data: atrib = [] } = useQuery({
    queryKey: ["atribuicoes", user.id],
    queryFn: async () => (await supabase.from("teacher_assignments").select("*").eq("user_id", user.id)).data ?? [],
  });
  async function toggle(sid: string, turma: string, on: boolean) {
    setBusy(true);
    const actual = atrib.find(a => a.subject_id === sid);
    const d = disc.find(d => d.id === sid);
    const formadas = Array.from(new Set(alunos.filter(a => a.classe === d?.classe).map(a => a.turma)));
    const antigas = actual ? (actual.turmas.length ? actual.turmas : formadas) : [];
    const turmas = on ? Array.from(new Set([...antigas, turma])) : antigas.filter(t => t !== turma);
    const result = actual
      ? turmas.length ? await supabase.from("teacher_assignments").update({turmas}).eq("id",actual.id) : await supabase.from("teacher_assignments").delete().eq("id",actual.id)
      : await supabase.from("teacher_assignments").insert({ user_id:user.id,subject_id:sid,turmas });
    setBusy(false); if (result.error) toast.error(result.error.message);
    else await qc.invalidateQueries();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader><DialogTitle>Disciplinas de {user.nome}</DialogTitle></DialogHeader>
        <Select value={ciclo} onValueChange={v => {setCiclo(v);setClasse("");}}><SelectTrigger aria-label="Ciclo"><SelectValue placeholder="Ciclo" /></SelectTrigger><SelectContent><SelectItem value="primario">Ensino Primário</SelectItem><SelectItem value="primeiro">Primeiro Ciclo</SelectItem></SelectContent></Select>
        {ciclo && <Select value={classe} onValueChange={setClasse}><SelectTrigger aria-label="Classe"><SelectValue placeholder="Classe" /></SelectTrigger><SelectContent>{ciclo === "primeiro" && <SelectItem value="todas">7ª, 8ª e 9ª Classes</SelectItem>}{classes.map(c => <SelectItem key={c} value={c}>{nomeClasse(c)}</SelectItem>)}</SelectContent></Select>}
        <div className="space-y-3">{classes.filter(c => listadas.some(d => d.classe === c)).map(c => <section key={c}><h3 className="mb-2 font-semibold">{nomeClasse(c)}</h3>{listadas.filter(d => d.classe === c).flatMap(d => {
          const actual = atrib.find(a => a.subject_id === d.id);
          const turmas = Array.from(new Set([...alunos.filter(a => a.classe === c).map(a => a.turma), ...(actual?.turmas ?? [])])).sort();
          return turmas.map(t => <label key={`${d.id}-${t}`} className="mb-2 flex items-center gap-2 text-sm"><Checkbox disabled={busy} checked={!!actual && (!actual.turmas.length || actual.turmas.includes(t))} onCheckedChange={v => toggle(d.id,t,v === true)} />{d.nome} {t}</label>);
        })}</section>)}{classe && !listadas.length && <p className="text-sm text-muted-foreground">Sem disciplinas nesta classe.</p>}</div>
      </DialogContent>
    </Dialog>
  );
}
