import { createFileRoute, Link } from "@tanstack/react-router";
import { useInstituicao } from "@/lib/dados";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KAMALA — Gestão Pedagógica" },
      { name: "description", content: "Portal de gestão pedagógica: alunos, notas, pautas e boletins do KAMALA." },
      { property: "og:title", content: "KAMALA — Gestão Pedagógica" },
      { property: "og:description", content: "Alunos, notas, pautas e boletins num só lugar." },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  const { data: inst } = useInstituicao();
  return (
    <div className="flex min-h-screen flex-col bg-[var(--tema-principal)] text-white">
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 flex h-36 w-36 items-center justify-center overflow-hidden rounded-full bg-background p-3 shadow-xl">
          {inst?.logo_url ? (
            <img src={inst.logo_url} alt="Logótipo da instituição" className="h-full w-full object-contain" />
          ) : (
            <GraduationCap className="h-16 w-16 text-primary" />
          )}
        </div>
        <p className="text-sm uppercase tracking-[0.25em] opacity-80">{inst?.republica ?? "República de Angola"}</p>
        <p className="mt-1 text-sm opacity-80">{inst?.ministerio}</p>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          {inst?.nome_escola ?? "KAMALA"}
        </h1>
        <p className="mt-4 text-lg opacity-85">Gestão Pedagógica · Ano lectivo {inst?.ano_lectivo ?? "2026/2027"}</p>
        <Button asChild size="lg" variant="secondary" className="mt-10">
          <Link to="/auth">Entrar no sistema</Link>
        </Button>
      </main>
      <footer className="space-y-1 py-4 text-center text-xs opacity-70">
        <div>{inst?.direccao_municipal}</div>
        <div className="font-medium uppercase tracking-wide">© 2026 - SEBASTIÃO MUNGONGO "TODOS OS DIREITOS, RESERVADOS"</div>
      </footer>
    </div>
  );
}
