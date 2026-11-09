import { useEffect } from "react";
import { useInstituicao } from "@/lib/dados";

/**
 * Usa o mesmo logótipo guardado nas Informações da Instituição
 * como favicon, ícone Apple e ícones do manifesto PWA.
 */
export function PwaInstitutionBranding() {
  const { data: instituicao } = useInstituicao();

  useEffect(() => {
    const logo = instituicao?.logo_url;
    if (!logo || typeof document === "undefined") return;

    let cancelado = false;
    let manifestUrl: string | undefined;

    const imagem = new Image();
    imagem.onload = async () => {
      if (cancelado) return;

      const criarIcone = (tamanho: number, maskable = false) => {
        const canvas = document.createElement("canvas");
        canvas.width = tamanho;
        canvas.height = tamanho;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        const margem = maskable ? 0.18 : 0.06;
        const area = tamanho * (1 - margem * 2);
        const escala = Math.min(area / imagem.naturalWidth, area / imagem.naturalHeight);
        const largura = imagem.naturalWidth * escala;
        const altura = imagem.naturalHeight * escala;
        ctx.clearRect(0, 0, tamanho, tamanho);
        ctx.drawImage(imagem, (tamanho - largura) / 2, (tamanho - altura) / 2, largura, altura);
        return canvas.toDataURL("image/png");
      };

      const icon192 = criarIcone(192);
      const icon512 = criarIcone(512);
      const iconMaskable = criarIcone(512, true);
      if (!icon192 || !icon512 || !iconMaskable || cancelado) return;

      const manifestoOriginal = await fetch("/manifest.webmanifest")
        .then((resposta) => resposta.ok ? resposta.json() : {})
        .catch(() => ({}));
      if (cancelado) return;

      const manifesto = {
        ...manifestoOriginal,
        icons: [
          { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: iconMaskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      };

      manifestUrl = URL.createObjectURL(
        new Blob([JSON.stringify(manifesto)], { type: "application/manifest+json" }),
      );
      const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (manifestLink) manifestLink.href = manifestUrl;

      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
        link.href = icon512;
      });
    };

    imagem.onerror = () => {
      console.warn("Não foi possível preparar os ícones PWA a partir do logótipo da instituição.");
    };
    imagem.src = logo;

    return () => {
      cancelado = true;
      if (manifestUrl) URL.revokeObjectURL(manifestUrl);
    };
  }, [instituicao?.logo_url]);

  return null;
}
