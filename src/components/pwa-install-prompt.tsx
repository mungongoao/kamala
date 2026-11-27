import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const SNOOZE_KEY = "school-pwa-install-snooze-until-v3";
const SNOOZE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /android/.test(ua);
  const edge = /edg\//.test(ua);
  const samsung = /samsungbrowser/.test(ua);
  const firefox = /firefox|fxios/.test(ua);
  const chrome = /chrome|crios/.test(ua) && !edge && !samsung;
  const safari = /safari/.test(ua) && !chrome && !edge && !samsung;
  const mac = /macintosh|mac os x/.test(ua) && !ios;
  return { ios, android, edge, samsung, firefox, chrome, safari, mac, mobile: ios || android };
}

function getInstallInstructions() {
  const p = getPlatform();
  if (p.ios) {
    return {
      title: "Instalar no iPhone ou iPad",
      steps: [
        "Se estiver noutro navegador, abra este endereço no Safari.",
        "Toque no botão Partilhar (quadrado com seta para cima).",
        "Desça a lista e escolha “Adicionar ao ecrã principal”.",
        "Ative “Abrir como aplicação web”, se aparecer, e toque em “Adicionar”.",
      ],
      note: "No iPhone e iPad, a instalação é feita pelo menu Partilhar do Safari; o navegador não apresenta o botão automático de instalação.",
    };
  }
  if (p.android && p.samsung) {
    return {
      title: "Instalar no Samsung Internet",
      steps: [
        "Abra o menu ☰ do Samsung Internet.",
        "Escolha “Adicionar página a” e depois “Ecrã inicial” (ou “Instalar aplicação”, se aparecer).",
        "Confirme em “Adicionar” ou “Instalar”.",
      ],
      note: "Se esta opção não aparecer, abra o mesmo endereço no Google Chrome e toque em “Instalar aplicação”.",
    };
  }
  if (p.android && p.firefox) {
    return {
      title: "Instalar no Firefox para Android",
      steps: [
        "Abra o menu ⋮ do Firefox.",
        "Escolha “Instalar” ou “Adicionar ao ecrã inicial”.",
        "Confirme a operação.",
      ],
      note: "A disponibilidade varia conforme a versão do Firefox. Se não aparecer, use Google Chrome ou Samsung Internet atualizado.",
    };
  }
  if (p.android) {
    return {
      title: "Instalar no Android",
      steps: [
        "Toque no menu ⋮ do navegador.",
        "Escolha “Instalar aplicação” ou “Adicionar ao ecrã inicial”.",
        "Toque em “Instalar” ou confirme “Adicionar”.",
      ],
      note: "Chrome, Edge, Brave e vários navegadores Android suportam instalação. Se a opção não aparecer, atualize o navegador e experimente o Google Chrome.",
    };
  }
  if (p.mac && p.safari) {
    return {
      title: "Adicionar ao Mac",
      steps: [
        "Abra esta página no Safari.",
        "Na barra de menus do Mac, escolha Ficheiro.",
        "Selecione “Adicionar ao Dock…” e confirme.",
      ],
      note: "Esta opção está disponível nas versões recentes do macOS. Também pode instalar pelo menu do Chrome ou Edge.",
    };
  }
  if (p.edge) {
    return {
      title: "Instalar no computador (Microsoft Edge)",
      steps: [
        "Abra o menu ⋯ no canto superior direito.",
        "Entre em “Aplicações” e escolha “Instalar este site como aplicação”.",
        "Confirme em “Instalar”.",
      ],
      note: "Também pode aparecer um ícone de instalação na barra de endereço.",
    };
  }
  if (p.chrome) {
    return {
      title: "Instalar no computador (Google Chrome)",
      steps: [
        "Clique no ícone de instalação na barra de endereço, se estiver visível; ou",
        "Abra o menu ⋮ e escolha “Transmitir, guardar e partilhar” > “Instalar página como aplicação” (o nome pode variar).",
        "Confirme em “Instalar”.",
      ],
      note: "A instalação PWA no computador é suportada sobretudo pelo Chrome e Edge.",
    };
  }
  if (p.firefox) {
    return {
      title: "Adicionar este sistema ao dispositivo",
      steps: [
        "No Firefox para computador, a instalação PWA direta pode não estar disponível.",
        "No telemóvel, abra o menu do Firefox e procure “Instalar” ou “Adicionar ao ecrã inicial”.",
        "No computador, use Google Chrome ou Microsoft Edge para instalar como aplicação.",
      ],
      note: "O sistema continua acessível normalmente pelo Firefox, mesmo quando a instalação PWA não é suportada.",
    };
  }
  return {
    title: "Adicionar este sistema ao dispositivo",
    steps: [
      "Abra o menu principal do navegador.",
      "Procure “Instalar aplicação”, “Adicionar ao ecrã inicial” ou “Adicionar à Dock”.",
      "Se não encontrar a opção, abra este endereço no Google Chrome, Microsoft Edge ou Safari.",
    ],
    note: "A instalação depende das funcionalidades disponibilizadas pelo navegador e pelo sistema operativo.",
  };
}

function readSnooze() {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeSnooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * DAY));
  } catch {
    // O convite continua funcional mesmo quando o armazenamento está bloqueado.
  }
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [instructions, setInstructions] = useState<ReturnType<typeof getInstallInstructions> | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    setInstructions(getInstallInstructions());
    const snoozed = readSnooze() > Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const show = () => {
      if (!isStandalone() && readSnooze() <= Date.now()) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setVisible(true), 1200);
      }
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      show();
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setHelpOpen(false);
      setDeferredPrompt(null);
      try { localStorage.removeItem(SNOOZE_KEY); } catch { /* armazenamento opcional */ }
    };
    const displayModes = ["standalone", "fullscreen", "minimal-ui"].map((mode) =>
      window.matchMedia(`(display-mode: ${mode})`),
    );
    const onDisplayModeChange = () => {
      if (isStandalone()) onInstalled();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    displayModes.forEach((query) => query.addEventListener?.("change", onDisplayModeChange));
    if (!snoozed) show();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      displayModes.forEach((query) => query.removeEventListener?.("change", onDisplayModeChange));
    };
  }, []);

  const adiar = () => {
    writeSnooze();
    setVisible(false);
    setHelpOpen(false);
  };

  const instalar = async () => {
    if (!deferredPrompt) {
      setHelpOpen(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        setVisible(false);
      } else {
        writeSnooze();
        setVisible(false);
      }
    } catch {
      setHelpOpen(true);
    }
  };

  if (installed) return null;

  return (
    <>
      {visible ? (
        <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto w-auto max-w-lg rounded-2xl border border-border bg-background p-4 text-foreground shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Instale a aplicação da sua instituição</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aceda ao sistema pelo ecrã inicial, sem precisar de procurar o endereço no navegador.
              </p>
            </div>
            <button type="button" onClick={adiar} aria-label="Fechar convite" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {helpOpen && instructions && (
            <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
              <p className="font-semibold">{instructions.title}</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                {instructions.steps.map((step, index) => <li key={index}>{step}</li>)}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">{instructions.note}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={adiar} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
              Mais tarde
            </button>
            <button type="button" onClick={() => { if (helpOpen) setHelpOpen(false); else void instalar(); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Download className="h-4 w-4" />
              {helpOpen ? "Fechar instruções" : deferredPrompt ? "Instalar agora" : "Como instalar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setVisible(true); setHelpOpen(false); }}
          className="fixed bottom-3 right-3 z-[99] inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground shadow-lg hover:bg-muted sm:bottom-5 sm:right-5"
          aria-label="Abrir opções de instalação da aplicação"
        >
          <Download className="h-4 w-4" />
          Instalar app
        </button>
      )}
    </>
  );
}
