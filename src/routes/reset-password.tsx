import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nova Palavra-passe — KAMALA" }, { name: "description", content: "Recuperação segura da conta KAMALA." }, { property: "og:title", content: "Nova Palavra-passe — KAMALA" }, { property: "og:description", content: "Recuperação segura da conta KAMALA." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ResetPassword,
});
function ResetPassword() {
  const [valid, setValid] = useState(false), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setValid(true); });
    if (hash.get("type") === "recovery") supabase.auth.getUser().then(({ data }) => { if (data.user) setValid(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!valid) return; setBusy(true);
    const { error } = await supabase.auth.updateUser({ password }); setBusy(false);
    if (error) return void toast.error(error.message);
    await supabase.auth.signOut(); toast.success("Palavra-passe actualizada."); window.location.assign("/auth");
  }
  return <main className="auth-page flex items-center justify-center px-4"><div className="w-full max-w-md rounded-md bg-card p-6"><h1 className="mb-5 text-2xl text-primary">Nova Palavra-passe</h1>{valid ? <form onSubmit={save} className="space-y-4"><Label htmlFor="new-password">Palavra-passe</Label><Input id="new-password" type="password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /><Button disabled={busy}>Definir palavra-passe</Button></form> : <p className="text-muted-foreground">Abra o link de recuperação recebido no seu email.</p>}</div></main>;
}