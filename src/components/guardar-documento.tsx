import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PaperSize } from "exceljs";

export function GuardarDocumento({ selector = ".doc", nome = "Documento KAMALA", preparar, disabled = false }: { selector?: string; nome?: string; preparar?: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function guardar() {
    setBusy(true);
    try {
      preparar?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const docs = Array.from(document.querySelectorAll<HTMLElement>(selector));
      if (!docs.length) throw new Error("Seleccione um documento.");
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      docs.forEach((doc, i) => {
        const sheet = workbook.addWorksheet(`Documento ${i + 1}`);
        let row = 1;
        function visit(node: Element) {
          if (node.tagName === "IMG") return;
          if (node.tagName === "TABLE") {
            const occupied = new Set<string>();
            node.querySelectorAll("tr").forEach((tr) => {
              let col = 1;
              Array.from(tr.children).forEach((cell) => {
                while (occupied.has(`${row}:${col}`)) col++;
                const td = cell as HTMLTableCellElement;
                const text = td.textContent?.trim() ?? "";
                const numeric = text.replace(",", ".");
                const c = sheet.getCell(row, col);
                c.value = /^-?\d+([.,]\d+)?$/.test(text) ? Number(numeric) : text;
                c.font = { name: "Arial", size: 11, bold: td.tagName === "TH", ...(td.classList.contains("neg") ? { color: { argb: "FFCC0000" } } : td.classList.contains("pos") ? { color: { argb: "FF1455CC" } } : {}) };
                c.alignment = { vertical: "middle", wrapText: true };
                const rs = td.rowSpan || 1, cs = td.colSpan || 1;
                if (rs > 1 || cs > 1) sheet.mergeCells(row, col, row + rs - 1, col + cs - 1);
                for (let r = row; r < row + rs; r++) for (let k = col; k < col + cs; k++) occupied.add(`${r}:${k}`);
                col += cs;
              });
              row++;
            });
            row++;
          } else if (node.children.length && !["P", "H1", "H2"].includes(node.tagName)) {
            Array.from(node.children).forEach(visit);
          } else {
            const text = node.textContent?.trim();
            if (text) { sheet.getCell(row++, 1).value = text; }
          }
        }
        visit(doc);
        sheet.columns.forEach((column) => { column.width = 20; });
        sheet.getColumn(2).width = 32;
        sheet.pageSetup = { orientation: doc.classList.contains("doc-a3") ? "landscape" : "portrait", paperSize: (doc.classList.contains("doc-a3") ? 8 : doc.classList.contains("doc-a5") ? 11 : 9) as PaperSize, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = `${nome.replace(/[^\p{L}\p{N} _-]/gu, "")}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Ficheiro Excel guardado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível guardar."); }
    finally { setBusy(false); }
  }
  return <Button type="button" variant="outline" disabled={disabled || busy} onClick={guardar}><Download className="mr-2 h-4 w-4" />{busy ? "A guardar…" : "Guardar · Excel"}</Button>;
}