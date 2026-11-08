import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDisciplinas, useMe } from "@/lib/dados";
import { nomeClasse } from "@/lib/avaliacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/disciplinas")({
  head: () => ({ meta: [{ title: "Disciplinas — KAMALA" }, { name: "description", content: "Cadastro de disciplinas por nível de ensino e classe." }] }),
  component: Disciplinas,
});

const NIVEIS: Record<string, { grupos: string[][] }> = {
  "Iniciação": { grupos: [["INIC"]] },
  "Ensino Primário": { grupos: [["1", "2", "3", "4"], ["5", "6"]] },
  "Primeiro Ciclo": { grupos: [["7", "8", "9"]] },
};
const TODAS_EXTRA = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function Disciplinas() {
  const { data: me } = useMe();
  const [nivel, setNivel] = useState("Ensino Primário");
  const [editarId, setEditarId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [extra, setExtra] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const { data: lista = [] } = useDisciplinas();
  const qc = useQueryClient();

  const porClasse = useMemo(() => {
    const m = new Map<string, typeof lista>();
    for (const d of lista) m.set(d.classe, [...(m.get(d.classe) ?? []), d]);
    return m;
  }, [lista]);

  if (!me?.isStaff) return <p>Sem permissão.</p>;

  const alternarGrupo = (g: string[]) => {
    const todas = g.every((c) => marcadas.includes(c));
    setMarcadas(todas ? marcadas.filter((c) => !g.includes(c)) : Array.from(new Set([...marcadas, ...g])));
  };

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const n = nome.trim();
    if (!n || n.length > 80) return void toast.error("Nome inválido.");
    if (editarId) {
      const { error } = await supabase.from("subjects").update({ nome: n, extra }).eq("id", editarId);
      if (error) return void toast.error(error.message);
      setEditarId(null); setNome(""); setExtra(false); setMarcadas([]);
      await qc.invalidateQueries(); toast.success("Disciplina actualizada."); return;
    }
    const classes = extra ? TODAS_EXTRA : marcadas;
    if (!classes.length) return void toast.error("Marque pelo menos uma classe.");
    let novas = 0, existentes = 0;
    for (const c of classes) {
      if ((porClasse.get(c) ?? []).some((d) => d.nome.toLowerCase() === n.toLowerCase())) { existentes++; continue; }
      const { error } = await supabase.from("subjects").insert({ classe: c, nome: n, extra, ordem: porClasse.get(c)?.length ?? 0 });
      if (error) { if (error.code === "23505") existentes++; else return void toast.error(error.message); } else novas++;
    }
    toast.success(`Disciplina adicionada a ${novas} classe(s)${existentes ? ` · ${existentes} já existiam` : ""}.`);
    setNome(""); setExtra(false); setMarcadas([]);
    qc.invalidateQueries({ queryKey: ["disciplinas"] });
  }

  async function remover(id: string, classe: string) {
    if (!confirm(`Remover esta disciplina da ${nomeClasse(classe)}? As notas lançadas nesta classe também serão apagadas.`)) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["disciplinas"] });
  }

  return (
    <div className="max-w-5xl">
      <PageTitle title="Disciplinas por Nível e Classe" />
      <Card className="mb-6"><CardContent className="space-y-4 p-4">
        <form onSubmit={adicionar} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input placeholder="Nome da disciplina" value={nome} onChange={(e) => setNome(e.target.value)} className="w-full sm:max-w-sm" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={extra} onCheckedChange={setExtra} /> Disciplina Extracurricular</label>
          </div>
          {editarId ? <p className="text-sm font-semibold">{nomeClasse(lista.find(d => d.id === editarId)?.classe ?? "INIC")}</p> : extra ? (
            <p className="text-sm text-muted-foreground">Será adicionada a todas as classes do Ensino Primário (1ª–6ª) e do Primeiro Ciclo (7ª–9ª).</p>
          ) : (
            <div className="space-y-3">
              <Select value={nivel} onValueChange={(v) => { setNivel(v); setMarcadas([]); }}>
                <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(NIVEIS).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
              {(NIVEIS[nivel]?.grupos ?? []).map((g) => (
                <div key={g.join()} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  {g.length > 1 && <Button type="button" size="sm" variant="outline" onClick={() => alternarGrupo(g)}>Todo o grupo</Button>}
                  {g.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={marcadas.includes(c)} onCheckedChange={(v) => setMarcadas(v ? [...marcadas, c] : marcadas.filter((x) => x !== c))} />
                      {nomeClasse(c)}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2"><Button>{editarId ? "Atualizar Dados" : "Adicionar"}</Button>{editarId && <Button type="button" variant="outline" onClick={() => { setEditarId(null); setNome(""); setExtra(false); }}>Cancelar</Button>}</div>
        </form>
      </CardContent></Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {["INIC", ...TODAS_EXTRA].map((c) => (
          <Card key={c}><CardContent className="p-4">
            <h3 className="mb-2 font-semibold">{nomeClasse(c)}</h3>
            {(porClasse.get(c) ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma disciplina.</p> : (
              <ul className="divide-y">
                {(porClasse.get(c) ?? []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span>{d.nome} {d.extra && <Badge variant="secondary" className="ml-1">Extra</Badge>}</span>
                    <div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" onClick={() => { setEditarId(d.id); setNome(d.nome); setExtra(d.extra); window.scrollTo({top:0,behavior:"smooth"}); }}><Pencil className="h-4 w-4" />Editar</Button><Button size="icon" variant="ghost" title="Remover desta classe" onClick={() => remover(d.id, c)}><Trash2 className="h-4 w-4" /></Button></div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
