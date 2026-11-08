import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInstituicao, useMe } from "@/lib/dados";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTitle } from "@/components/escola";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Instituição — KAMALA" }, { name: "description", content: "Dados institucionais dos documentos." }] }),
  component: Config,
});

const CAMPOS = [
  ["republica", "República"],
  ["ministerio", "Ministério"],
  ["direccao_municipal", "Direcção Municipal"],
  ["nome_escola", "Nome da escola"],
  ["ano_lectivo", "Ano lectivo"],
] as const;

function Config() {
  const { data: me } = useMe();
  const { data: inst } = useInstituicao();
  const qc = useQueryClient();
  type K = "id" | "republica" | "ministerio" | "direccao_municipal" | "nome_escola" | "ano_lectivo" | "logo_url" | "pauta_pedagogico" | "pauta_direccao" | "boletim_coord_manha" | "boletim_coord_tarde" | "cor_fundo" | "cor_texto" | "cor_paginas";
  const [f, setF] = useState<Partial<Record<K, string>>>({});
  const [corTemaPrincipal, setCorTemaPrincipal] = useState("#1e3a5f");
  useEffect(() => { try { setCorTemaPrincipal(localStorage.getItem("jzymar-cor-tema-principal") || "#1e3a5f"); } catch { /* armazenamento opcional */ } }, []);
  useEffect(() => { document.documentElement.style.setProperty("--tema-principal", corTemaPrincipal); }, [corTemaPrincipal]);
  useEffect(() => {
    if (inst) setF(Object.fromEntries(Object.entries(inst).map(([k, v]) => [k, String(v ?? "")])) as Partial<Record<K, string>>);
  }, [inst]);

  if (!me?.isAdmin) return <p>Apenas o ADM tem acesso a esta página.</p>;

  const set = (k: K) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  function carregarLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400_000) return void toast.error("O logótipo deve ter menos de 400 KB.");
    const r = new FileReader();
    r.onload = () => setF((p) => ({ ...p, logo_url: r.result as string }));
    r.readAsDataURL(file);
  }

  async function guardar() {
    const { id: _id, ...rest } = f;
    const { error } = await supabase.from("institution_settings").update({ ...rest, logo_url: f.logo_url || null, cor_fundo: f.cor_fundo || "#f8fafc", cor_texto: f.cor_texto || "#243247", cor_paginas: f.cor_paginas || "#ffffff" }).eq("id", 1);
    if (error) return void toast.error(error.message);
    toast.success("Informações guardadas.");
    qc.invalidateQueries({ queryKey: ["instituicao"] });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="Informações da Instituição"><Button onClick={guardar}>Guardar</Button></PageTitle>
      <Card>
        <CardHeader><CardTitle>Cabeçalho dos documentos</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {CAMPOS.map(([k, l]) => (
            <div key={k}><Label>{l}</Label><Input value={f[k] ?? ""} onChange={set(k)} /></div>
          ))}
          <div className="sm:col-span-2">
            <Label>Logótipo da instituição (aparece também na página inicial)</Label>
            <div className="mt-2 flex items-center gap-4">
              {f.logo_url && <img src={f.logo_url} alt="Logótipo" className="h-20 w-20 rounded border object-contain" />}
              <Input type="file" accept="image/*" onChange={carregarLogo} className="max-w-xs" />
              {f.logo_url && <Button variant="outline" size="sm" onClick={() => setF({ ...f, logo_url: "" })}>Remover</Button>}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Personalização das Cores</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label>Cor de fundo do sistema</Label><Input type="color" value={f.cor_fundo || "#f8fafc"} onChange={set("cor_fundo")} className="h-11 p-1" /></div>
          <div className="space-y-2"><Label>Cor das letras</Label><Input type="color" value={f.cor_texto || "#243247"} onChange={set("cor_texto")} className="h-11 p-1" /></div>
          <div className="space-y-2"><Label>Cor das páginas e cartões</Label><Input type="color" value={f.cor_paginas || "#ffffff"} onChange={set("cor_paginas")} className="h-11 p-1" /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tema principal</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3"><Label>Cor do tema principal / fundo externo</Label><Input type="color" value={corTemaPrincipal} onChange={(e) => { setCorTemaPrincipal(e.target.value); try { localStorage.setItem("jzymar-cor-tema-principal", e.target.value); } catch { /* armazenamento opcional */ } }} className="h-11 p-1" /><p className="text-xs text-muted-foreground">Aplica-se à barra fixa, cabeçalho institucional, página inicial e fundo externo de autenticação. A alteração é imediata e fica guardada neste navegador.</p></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Rodapé das Pautas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><Label>O Pedagógico (nome para assinatura)</Label><Input value={f.pauta_pedagogico ?? ""} onChange={set("pauta_pedagogico")} /></div>
          <div><Label>A Direcção (nome para assinatura)</Label><Input value={f.pauta_direccao ?? ""} onChange={set("pauta_direccao")} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Rodapé do Boletim de Notas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><Label>O Coordenador da Manhã</Label><Input value={f.boletim_coord_manha ?? ""} onChange={set("boletim_coord_manha")} /></div>
          <div><Label>O Coordenador da Tarde</Label><Input value={f.boletim_coord_tarde ?? ""} onChange={set("boletim_coord_tarde")} /></div>
        </CardContent>
      </Card>
    </div>
  );
}
