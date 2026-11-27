import { useEffect } from "react";
import { useInstituicao } from "@/lib/dados";

/**
 * Aplica o logótipo configurado nas Informações da Instituição
 * ao manifesto PWA, favicon e ícone de instalação Apple.
 */
export function PwaInstitutionBranding() {
  const { data: instituicao } = useInstituicao();

  useEffect(() => {
    const logo = instituicao?.logo_url;
    if (!logo || typeof document === "undefined") return;

    let cancelado = false;
    let manifestUrl: string | undefined;

    const aplicarLinks = (iconUrl: string) => {
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
        link.href = iconUrl;
      });
    };

    const aplicarManifesto = async (icons: Array<Record<string, string>>) => {
      const manifestoOriginal = await fetch("/manifest.webmanifest")
        .then((resposta) => resposta.ok ? resposta.json() : {})
        .catch(() => ({}));
      if (cancelado) return;

      const manifesto = { ...manifestoOriginal, icons };
      manifestUrl = URL.createObjectURL(
        new Blob([JSON.stringify(manifesto)], { type: "application/manifest+json" }),
      );
      const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (manifestLink) manifestLink.href = manifestUrl;
    };

    const imagem = new Image();
    // Permite gerar PNGs quando o armazenamento remoto disponibiliza CORS.
    imagem.crossOrigin = "anonymous";

    imagem.onload = async () => {
      if (cancelado) return;

      try {
        const criarIcone = (tamanho: number, maskable = false) => {
          const canvas = document.createElement("canvas");
          canvas.width = tamanho;
          canvas.height = tamanho;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas indisponível");

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
        if (cancelado) return;

        aplicarLinks(icon512);
        await aplicarManifesto([
          { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: iconMaskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ]);
      } catch (erro) {
        // Se o servidor do logótipo bloquear canvas/CORS, usa a imagem original
        // em vez de deixar o ícone institucional sem configuração.
        console.warn("A usar o logótipo original como ícone PWA:", erro);
        aplicarLinks(logo);
        void aplicarManifesto([{ src: logo, sizes: "any", purpose: "any" }]);
      }
    };

    imagem.onerror = () => {
      console.warn("Não foi possível carregar o logótipo institucional para os ícones PWA.");
    };
    imagem.src = logo;

    return () => {
      cancelado = true;
      if (manifestUrl) URL.revokeObjectURL(manifestUrl);
    };
  }, [instituicao?.logo_url]);

  return null;
}
