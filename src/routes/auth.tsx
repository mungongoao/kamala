import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { useInstituicao } from "@/lib/dados";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — KAMALA" },
      { name: "description", content: "Acesso ao sistema de gestão pedagógica." },
      { property: "og:title", content: "Entrar — KAMALA" },
      { property: "og:description", content: "Acesso ao sistema de gestão pedagógica." },
    ],
  }),
  component: AuthPage,
});

const registoSchema = z.object({
  nome: z.string().trim().min(3, "Nome demasiado curto").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  senha: z.string().min(8, "A palavra-passe deve ter pelo menos 8 caracteres").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("professor");
  const [genero, setGenero] = useState("M");
  const [aba, setAba] = useState("entrar");
  const [mostrar, setMostrar] = useState(false);
  const [recuperar, setRecuperar] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [validado, setValidado] = useState(false);
  const { data: inst } = useInstituicao();

  async function recuperarConta(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      if (!enviado) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setEnviado(true); toast.success("Se existir uma conta, receberá um email de recuperação.");
      } else if (!validado) {
        if (!/^\d{6}$/.test(codigo)) throw new Error("Introduza o código de seis dígitos recebido.");
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: codigo, type: "recovery" });
        if (error) throw new Error("Código inválido ou expirado.");
        setValidado(true); setSenha("");
      } else {
        if (senha.length < 8) throw new Error("A palavra-passe deve ter pelo menos 8 caracteres.");
        const { error } = await supabase.auth.updateUser({ password: senha });
        if (error) throw error;
        await supabase.auth.signOut();
        setRecuperar(false); setEnviado(false); setValidado(false); setSenha("");
        toast.success("Palavra-passe actualizada. Inicie sessão.");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível recuperar a conta."); }
    finally { setLoading(false); }
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setLoading(false);
    if (error) return void toast.error("Email ou palavra-passe incorrectos.");
    navigate({ to: "/painel" });
  }

  async function registar(e: React.FormEvent) {
    e.preventDefault();
    const p = registoSchema.safeParse({ nome, email, senha });
    if (!p.success) return void toast.error(p.error.issues[0]?.message);
    setLoading(true);
    const { data: signup, error } = await supabase.auth.signUp({
      email: p.data.email,
      password: p.data.senha,
      options: { emailRedirectTo: window.location.origin + "/auth", data: { nome: p.data.nome, cargo, genero } },
    });
    setLoading(false);
    if (error) return void toast.error(error.message);
    if (signup.session) await supabase.rpc("set_own_gender", { _genero: genero });
    toast.success("Registo feito. Confirme o seu email e aguarde a credenciação.");
  }

  return (
    <div className="auth-page flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="auth-brand mb-2 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-md bg-secondary p-2">
            {inst?.logo_url ? <img src={inst.logo_url} alt="Logótipo da instituição" className="h-full w-full object-contain" /> : <GraduationCap className="h-12 w-12 text-primary" />}
          </div>
          <p className="mb-2 text-sm font-semibold text-primary">{inst?.nome_escola ?? "KAMALA"}</p>
          <CardTitle className="text-center text-2xl">{recuperar ? "Recuperar Palavra-passe" : aba === "registar" ? "Cadastrar" : "Iniciar Sessão"}</CardTitle>
        </CardHeader>
        <CardContent>
          {recuperar ? <form onSubmit={recuperarConta} className="space-y-4">
            <div><Label htmlFor="recovery-email">Email</Label><Input id="recovery-email" type="email" required disabled={enviado} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {enviado && !validado && <div><Label htmlFor="recovery-code">Código de seis dígitos</Label><Input id="recovery-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} /><p className="mt-2 text-sm text-muted-foreground">Se o email contiver um link, abra-o para definir a nova palavra-passe.</p></div>}
            {validado && <div><Label>Nova palavra-passe</Label><Input type={mostrar ? "text" : "password"} minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} /></div>}
            <Button className="w-full" disabled={loading}>{validado ? "Definir palavra-passe" : enviado ? "Validar código" : "Enviar email de recuperação"}</Button>
            {enviado && !validado && <Button type="button" variant="ghost" disabled={loading} onClick={() => { setEnviado(false); setCodigo(""); }}>Enviar novamente</Button>}
            <Button type="button" variant="outline" className="w-full" onClick={() => { setRecuperar(false); setEnviado(false); setValidado(false); }}>Voltar</Button>
          </form> : <Tabs value={aba} onValueChange={setAba}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="registar">Registar</TabsTrigger>
            </TabsList>
            <TabsContent value="entrar">
              <form onSubmit={entrar} className="mt-4 space-y-4">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Palavra-passe</Label><div className="relative"><Input type={mostrar ? "text" : "password"} required value={senha} onChange={(e) => setSenha(e.target.value)} className="pr-12" /><Button type="button" size="icon" variant="ghost" className="absolute right-0 top-0" aria-label={mostrar ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} onClick={() => setMostrar(!mostrar)}>{mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></div>
                <Button className="w-full" disabled={loading}>Entrar</Button>
                <Button type="button" variant="link" className="w-full" onClick={() => setRecuperar(true)}>Esqueci a palavra-passe</Button>
              </form>
            </TabsContent>
            <TabsContent value="registar">
              <form onSubmit={registar} className="mt-4 space-y-4">
                <div><Label>Nome completo</Label><Input required value={nome} onChange={(e) => setNome(e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Palavra-passe</Label><div className="relative"><Input type={mostrar ? "text" : "password"} required value={senha} onChange={(e) => setSenha(e.target.value)} className="pr-12" /><Button type="button" size="icon" variant="ghost" className="absolute right-0 top-0" aria-label={mostrar ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} onClick={() => setMostrar(!mostrar)}>{mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></div>
                <div>
                  <Label>Cargo pretendido</Label>
                  <Select value={cargo} onValueChange={setCargo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="administrativo">Administrativo</SelectItem>
                      <SelectItem value="professor">Professor</SelectItem>
                      <SelectItem value="coordenador">Coordenador</SelectItem>
                      <SelectItem value="pedagogico">Pedagógico</SelectItem>
                      <SelectItem value="encarregado">Encarregado de Educação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={loading}>Criar conta</Button>
                <p className="text-center text-xs text-muted-foreground">A conta fica pendente até ser credenciada pelo ADM ou Pedagógico.</p>
              </form>
            </TabsContent>
          </Tabs>}
        </CardContent>
      </Card>
    </div>
  );
}
