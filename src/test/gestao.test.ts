import { describe, expect, it } from "vitest";
import { alunoSchema, TURMAS, entradaExterna, percentagem, turmaPermitida } from "@/lib/gestao";

describe("Gestão de alunos", () => {
  it("permite exactamente as turmas A a I", () => {
    expect(TURMAS).toEqual(["A","B","C","D","E","F","G","H","I"]);
    expect(alunoSchema.safeParse({nome:"Aluno",genero:"M",classe:"6",turma:"J",estado:"Activo"}).success).toBe(false);
  });
  it("não inclui BI, idade, telefone ou ID nos dados editáveis", () => {
    expect(alunoSchema.parse({nome:"Aluno",genero:"F",classe:"1",turma:"A",estado:"Activo",id:2600,bi:"remover",idade:10,telefone:"remover"})).toEqual({nome:"Aluno",genero:"F",classe:"1",turma:"A",estado:"Activo"});
  });
  it("não autoriza editar outra turma", () => {
    expect(turmaPermitida([{subject_id:"portugues",turmas:["A"]}],"portugues","B")).toBe(false);
    expect(turmaPermitida([{subject_id:"portugues",turmas:["A"]}],"portugues","A")).toBe(true);
  });
  it("preserva vínculos antigos sem limite de disciplinas", () => {
    const rows = Array.from({length:100},(_,i)=>({subject_id:String(i),turmas:[]}));
    expect(turmaPermitida(rows,"99","I")).toBe(true);
  });
  it("calcula percentagens e evita divisão por zero", () => {
    expect(percentagem(5,20)).toBe(25); expect(percentagem(0,0)).toBe(0);
  });
});
describe("Entrada externa", () => {
  it("encaminha primeira entrada por ligação externa", () => { expect(entradaExterna("/boletins",true,false)).toBe(true); });
  it("refresh de login ou cadastro volta ao início", () => { expect(entradaExterna("/auth",false,true)).toBe(false); });
  it("preserva refresh e navegação interna autenticada", () => { expect(entradaExterna("/notas",true,true)).toBe(false); });
  it("preserva recuperação de palavra-passe", () => { expect(entradaExterna("/reset-password",false,false)).toBe(false); });
});