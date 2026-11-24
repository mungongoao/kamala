import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Clock, ShieldCheck, ShieldOff } from "lucide-react";

const week = [{n:1,t:"Seg"},{n:2,t:"Ter"},{n:3,t:"Qua"},{n:4,t:"Qui"},{n:5,t:"Sex"},{n:6,t:"Sáb"},{n:7,t:"Dom"}];
const fmt = (n:number) => `${Math.floor(n/60)}m ${n%60}s`;

export function TeacherAccessManager() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [days, setDays] = useState<number[]>([1,2,3,4,5,6,7]);
  const { data: teachers = [], isLoading } = useQuery({
    queryKey:["teacher-access-manager"],
    queryFn:async()=>{
      const [{data:profiles,error:pe},{data:roles,error:re},{data:controls,error:ce}] = await Promise.all([
        (supabase as any).from("profiles").select("id,nome,email,status").is("deleted_at",null).order("nome"),
        (supabase as any).from("user_roles").select("user_id,role"),
        (supabase as any).from("teacher_access_control").select("*"),
      ]);
      if(pe) throw pe; if(re) throw re; if(ce) throw ce;
      const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Luanda"}).format(new Date());
      const {data:usage,error:ue} = await (supabase as any).from("teacher_daily_usage").select("*").eq("usage_date",today);
      if(ue) throw ue;
      return (profiles??[]).filter((p:any)=>(roles??[]).some((r:any)=>r.user_id===p.id&&r.role==="professor") && !(roles??[]).some((r:any)=>r.user_id===p.id&&r.role==="coordenador"))
        .map((p:any)=>({...p,access:(controls??[]).find((a:any)=>a.user_id===p.id),usage:(usage??[]).find((u:any)=>u.user_id===p.id)}));
    }
  });
  const refresh=()=>qc.invalidateQueries({queryKey:["teacher-access-manager"]});
  async function setOne(id:string,enabled:boolean,weekdays?:number[]) {
    const {error}=await (supabase as any).rpc("set_teacher_access",{_uid:id,_enabled:enabled,_allowed_weekdays:weekdays??null});
    if(error){toast.error(error.message);return;}
    toast.success(enabled?"Professor credenciado para utilização.":"Acesso do Professor revogado.");
    refresh();
  }
  async function setAll(enabled:boolean) {
    if(!confirm(enabled?"Autorizar todos os Professores?":"Revogar o acesso de todos os Professores?")) return;
    const {data,error}=await (supabase as any).rpc("set_all_teachers_access",{_enabled:enabled});
    if(error){toast.error(error.message);return;}
    toast.success(`Operação concluída. Registos abrangidos: ${data??0}.`);
    refresh();
  }
  function openDays(t:any) { setDays(t.access?.allowed_weekdays??[1,2,3,4,5,6,7]); setSelected(t); }
  async function saveDays() { if(!selected)return; await setOne(selected.id,selected.access?.enabled??true,days); setSelected(null); }
  const limit = [6,7].includes(Number(new Intl.DateTimeFormat("en",{timeZone:"Africa/Luanda",weekday:"short"}).format(new Date())==="Sat"?6:new Intl.DateTimeFormat("en",{timeZone:"Africa/Luanda",weekday:"short"}).format(new Date())==="Sun"?7:0))?5400:3600;
  return <section className="mb-6 space-y-3 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">Autorização e tempo dos Professores</h2><p className="text-xs text-muted-foreground">60 min de segunda a sexta · 90 min ao sábado e domingo. Os Coordenadores ficam excluídos.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={()=>setAll(true)}><ShieldCheck className="mr-1 h-4 w-4"/>Credenciar todos</Button>
        <Button size="sm" variant="destructive" onClick={()=>setAll(false)}><ShieldOff className="mr-1 h-4 w-4"/>Revogar todos</Button>
      </div>
    </div>
    {isLoading?<p className="text-sm text-muted-foreground">A carregar Professores…</p>:<div className="overflow-x-auto">
      <Table><TableHeader><TableRow><TableHead>Professor</TableHead><TableHead>Autorização</TableHead><TableHead>Tempo utilizado hoje</TableHead><TableHead>Dias</TableHead><TableHead className="text-right">Acção</TableHead></TableRow></TableHeader>
      <TableBody>{teachers.map((t:any)=> <TableRow key={t.id}>
        <TableCell><div className="font-medium">{t.nome}</div><div className="text-xs text-muted-foreground">{t.email}</div></TableCell>
        <TableCell><Badge variant={t.access?.enabled===false?"destructive":"default"}>{t.access?.enabled===false?"Revogado":"Credenciado"}</Badge></TableCell>
        <TableCell><span className="inline-flex items-center gap-1 text-sm"><Clock className="h-3 w-3"/>{fmt(t.usage?.used_seconds??0)} / {fmt(limit)}</span></TableCell>
        <TableCell><Button size="sm" variant="outline" onClick={()=>openDays(t)}><CalendarDays className="mr-1 h-3 w-3"/>Configurar</Button></TableCell>
        <TableCell className="text-right"><Button size="sm" variant={t.access?.enabled===false?"default":"outline"} onClick={()=>setOne(t.id,t.access?.enabled===false)}>{t.access?.enabled===false?"Credenciar":"Revogar"}</Button></TableCell>
      </TableRow>)}</TableBody></Table>
      {teachers.length===0&&<p className="p-3 text-sm text-muted-foreground">Não existem Professores credenciados.</p>}
    </div>}
    <Dialog open={!!selected} onOpenChange={o=>!o&&setSelected(null)}><DialogContent>
      <DialogHeader><DialogTitle>Dias autorizados — {selected?.nome}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Seleccione os dias em que este Professor poderá entrar no sistema.</p>
      <div className="grid grid-cols-4 gap-3">{week.map(d=><label key={d.n} className="flex items-center gap-2 text-sm"><Checkbox checked={days.includes(d.n)} onCheckedChange={v=>setDays(old=>v?[...old,d.n].sort() : old.filter(x=>x!==d.n))}/>{d.t}</label>)}</div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setSelected(null)}>Cancelar</Button><Button onClick={saveDays}>Guardar dias</Button></div>
    </DialogContent></Dialog>
  </section>;
}
