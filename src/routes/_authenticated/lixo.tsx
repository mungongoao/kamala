import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/dados";
import { eliminarUsuarioPermanentemente } from "@/lib/usuarios.functions";
import { PageTitle } from "@/components/escola";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lixo")({
  head: () => ({ meta: [{ title: "Lixo — KAMALA" }] }),
  component: Lixo,
});

function Lixo() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const eliminarUtilizador = useServerFn(eliminarUsuarioPermanentemente);
  const { data: alunos = [] } = useQuery({
    queryKey: ["lixo-alunos"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id,nome,classe,turma,deleted_at").not("deleted_at", "is", null).order("deleted_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: utilizadores = [] } = useQuery({
    queryKey: ["lixo-utilizadores"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,nome,email,deleted_at").not("deleted_at", "is", null).order("deleted_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!me?.isStaff) return <p>Sem permissão.</p>;
  const actualizar = async () => { await qc.invalidateQueries(); };
  const prazo = (data: string | null) => data ? new Date(new Date(data).getTime() + 15 * 86400000).toLocaleDateString("pt-PT") : "—";

  async function restaurarAluno(id: number) {
    const { error } = await supabase.from("students").update({ deleted_at: null }).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Aluno restaurado."); await actualizar();
  }
  async function apagarAluno(id: number) {
    if (!confirm("Eliminar permanentemente este aluno e as respectivas notas? Esta acção não pode ser desfeita.")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Aluno eliminado definitivamente."); await actualizar();
  }
  async function restaurarUtilizador(id: string) {
    const { error } = await supabase.rpc("restaurar_utilizador", { _uid: id });
    if (error) return void toast.error(error.message);
    toast.success("Utilizador restaurado."); await actualizar();
  }
  async function apagarUtilizador(id: string) {
    if (!confirm("Eliminar permanentemente este utilizador? Não poderá recuperar a conta.")) return;
    try { await eliminarUtilizador({ data: { id } }); toast.success("Utilizador eliminado definitivamente."); await actualizar(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return <div>
    <PageTitle title="Lixo" />
    <p className="mb-6 text-sm text-muted-foreground">Os registos permanecem aqui durante 15 dias. Depois desse prazo, a limpeza automática elimina-os definitivamente. Também pode restaurar ou eliminar permanentemente antes do prazo.</p>
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">Alunos eliminados ({alunos.length})</h2>
      <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Classe</TableHead><TableHead>Turma</TableHead><TableHead>Eliminação definitiva</TableHead><TableHead>Acções</TableHead></TableRow></TableHeader>
        <TableBody>{alunos.map(a => <TableRow key={a.id}><TableCell>{a.nome}</TableCell><TableCell>{a.classe}</TableCell><TableCell>{a.turma}</TableCell><TableCell>{prazo(a.deleted_at)}</TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => restaurarAluno(a.id)}><RotateCcw className="mr-1 h-4 w-4" />Restaurar</Button><Button size="sm" variant="destructive" onClick={() => apagarAluno(a.id)}><Trash2 className="mr-1 h-4 w-4" />Eliminar</Button></div></TableCell></TableRow>)}
        {!alunos.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">O Lixo de alunos está vazio.</TableCell></TableRow>}</TableBody>
      </Table>
    </section>
    {me.isAdmin && <section>
      <h2 className="mb-3 text-xl font-semibold">Utilizadores eliminados ({utilizadores.length})</h2>
      <Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Eliminação definitiva</TableHead><TableHead>Acções</TableHead></TableRow></TableHeader>
        <TableBody>{utilizadores.map(u => <TableRow key={u.id}><TableCell>{u.nome}</TableCell><TableCell>{u.email}</TableCell><TableCell>{prazo(u.deleted_at)}</TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => restaurarUtilizador(u.id)}><RotateCcw className="mr-1 h-4 w-4" />Restaurar</Button><Button size="sm" variant="destructive" onClick={() => apagarUtilizador(u.id)}><Trash2 className="mr-1 h-4 w-4" />Eliminar</Button></div></TableCell></TableRow>)}
        {!utilizadores.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">O Lixo de utilizadores está vazio.</TableCell></TableRow>}</TableBody>
      </Table>
    </section>}
  </div>;
}
