import { z } from "zod";

export const TURMAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;
export const alunoSchema = z.object({
  nome: z.string().trim().min(3, "Nome demasiado curto").max(120),
  genero: z.enum(["M", "F"]),
  classe: z.enum(["INIC", "1", "2", "3", "4", "5", "6", "7", "8", "9"]),
  turma: z.enum(TURMAS),
  estado: z.enum(["Activo", "Desistente"]),
});
export const percentagem = (quantidade: number, total: number) => total > 0 ? Math.round(quantidade / total * 100) : 0;
export function turmaPermitida(atribuicoes: { subject_id: string; turmas: string[] }[], subject: string, turma: string) {
  return atribuicoes.some((a) => a.subject_id === subject && (a.turmas.length === 0 || a.turmas.includes(turma)));
}
export function entradaExterna(path: string, autenticado: boolean, reload: boolean, visitou: boolean) {
  if (path === "/" || path === "/reset-password") return false;
  if (path === "/auth") return false;
  return autenticado && !reload && !visitou;
}