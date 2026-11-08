import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useInstituicao, NOMES_PAPEL } from "@/lib/dados";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MessageCircle } from "lucide-react";
import {
  LayoutDashboard, Settings, BookOpen, UserPlus, ListOrdered, PenLine, Table2, FileText, Users, LogOut, TrendingUp, BarChart3, Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const { data: me, isLoading } = useMe();
  const { data: inst } = useInstituicao();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const mostrarDireitos = !["/boletins", "/pautas", "/lista-nominal"].includes(pathname);

  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (isLoading) return <div className="p-10 text-muted-foreground">A carregar…</div>;

  if (!me?.aprovado) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">Conta {me?.profile?.status === "REVOGADO" ? "revogada" : "pendente"}</h1>
          <p className="mt-3 text-muted-foreground">
            {me?.profile?.status === "REVOGADO"
              ? "O seu acesso foi revogado. Contacte a Direcção."
              : "A sua conta aguarda credenciação pelo ADM ou pelo Pedagógico."}
          </p>
          {me?.profile?.status !== "REVOGADO" && (
            <a
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/244973686617?text=${encodeURIComponent(`Olá ADM. Acabei de me registar no sistema KAMALA.\nNome: ${me?.profile?.nome ?? ""}\nFunção: ${me?.profile?.cargo_pretendido ?? ""}\nPor favor, credencie a minha conta.`)}`}
            >
              <MessageCircle className="h-4 w-4" /> Avisar o ADM no WhatsApp
            </a>
          )}
          <div><Button className="mt-6" variant="outline" onClick={sair}>Sair</Button></div>
        </div>
      </div>
    );
  }

  const links = [
    { to: "/painel", label: "Painel", icon: LayoutDashboard, show: !me.isEncarregado },
    { to: "/aproveitamento", label: "Aproveitamento", icon: TrendingUp, show: me.isEncarregado },
    { to: "/configuracoes", label: "Instituição", icon: Settings, show: me.isAdmin },
    { to: "/disciplinas", label: "Disciplinas", icon: BookOpen, show: me.isStaff },
    { to: "/alunos", label: "Cadastro de Alunos", icon: UserPlus, show: me.isStaff },
    { to: "/lista-nominal", label: "Lista Nominal", icon: ListOrdered, show: !me.isEncarregado },
    { to: "/notas", label: "Lançar Notas", icon: PenLine, show: me.isStaff || me.isProfessor || me.isCoordenador },
    { to: "/pautas", label: "Pautas", icon: Table2, show: !me.isEncarregado },
    { to: "/boletins", label: "Boletins", icon: FileText, show: !me.isEncarregado },
    { to: "/estatisticas", label: "Estatísticas", icon: BarChart3, show: me.isStaff || me.isProfessor },
    { to: "/utilizadores", label: "Utilizadores", icon: Users, show: me.isStaff },
  ] as const;

  const sairBotao = (cls: string, texto: boolean) => (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="secondary" className={cls} title="Sair">
                <LogOut className="h-4 w-4" />{texto && <span className="ml-2">Sair</span>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sair do sistema?</AlertDialogTitle>
                <AlertDialogDescription>Confirma que pretende terminar a sessão?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Não</AlertDialogCancel>
                <AlertDialogAction onClick={sair}>Sim</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 z-30 flex w-full shrink-0 flex-col bg-[var(--tema-principal)] text-white md:static md:h-auto md:min-h-screen md:w-64 print:hidden">
        <div className="flex items-center gap-3 border-b border-sidebar-border p-3 md:p-4">
          {inst?.logo_url && <img src={inst.logo_url} alt="" className="h-10 w-10 rounded bg-background object-contain p-0.5" />}
          <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight md:whitespace-normal">{inst?.nome_escola}</div>
          <div className="md:hidden">{sairBotao("", true)}</div>
        </div>
        <nav className="flex flex-1 snap-x gap-1 overflow-x-auto scroll-smooth p-2 md:block md:space-y-1 md:overflow-visible md:p-3">
          {links.filter((l) => l.show).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent md:gap-3"
              activeProps={{ className: "bg-sidebar-accent font-semibold" }}
            >
              <l.icon className="h-4 w-4 shrink-0" /> <span>{l.label}</span>
            </Link>
          ))}
          {me.isStaff && <a href="/lixo" className="flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent md:gap-3"><Trash2 className="h-4 w-4 shrink-0" /><span>Lixo</span></a>}
        </nav>
        <div className="hidden border-t border-sidebar-border p-4 text-xs md:block">
          <div><div className="font-medium">{me.profile?.nome}</div><div className="opacity-70">{me.papeis.map((p) => NOMES_PAPEL[p]).join(", ")}</div></div>
          {sairBotao("mt-3 w-full", true)}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-x-auto">
        <header className="z-20 flex flex-wrap md:sticky items-center justify-between gap-2 border-b bg-[var(--tema-principal)] px-3 py-3 text-white shadow sm:px-6 print:hidden md:top-0">
          <div className="min-w-0 text-base font-bold leading-tight sm:text-lg md:text-xl">{inst?.nome_escola}</div>
          <span className="shrink-0 rounded-full bg-background px-3 py-1 text-xs font-semibold text-primary sm:text-sm">Ano lectivo {inst?.ano_lectivo}</span>
        </header>
        <div className="flex-1 p-3 sm:p-6"><Outlet /></div>
        {mostrarDireitos && (
          <footer className="border-t px-3 py-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground print:hidden">
            © 2026 - SEBASTIÃO MUNGONGO "TODOS OS DIREITOS, RESERVADOS"
          </footer>
        )}
      </main>
    </div>
  );
}
