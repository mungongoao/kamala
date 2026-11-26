import { useEffect, useState } from "react";
import { Download, X, Smartphone, Share, MoreVertical } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const SNOOZE_KEY = "school-pwa-install-snooze-until-v2";
const INSTALLED_KEY = "school-pwa-installed-v2";
const SNOOZE_DAYS = 3;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      localStorage.setItem(INSTALLED_KEY, "1");
      return;
    }

    setIos(isIos());
    const snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    if (snoozeUntil > Date.now()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      if (!isStandalone()) timer = setTimeout(() => setVisible(true), 1800);
    };

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      show();
    };
    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "1");
      localStorage.removeItem(SNOOZE_KEY);
      setVisible(false);
      setHelpOpen(false);
    };
    const onDisplayModeChange = () => {
      if (isStandalone()) onInstalled();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    displayMode.addEventListener?.("change", onDisplayModeChange);

    // Em navegadores que não emitem beforeinstallprompt (ex.: iOS),
    // mostrar o convite e fornecer instruções manuais.
    show();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  const adiar = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
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
        localStorage.setItem(INSTALLED_KEY, "1");
      } else {
        localStorage.setItem(SNOOZE_KEY, String(Date.now() + 2 * 24 * 60 * 60 * 1000));
        setVisible(false);
      }
    } catch {
      setHelpOpen(true);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto w-auto max-w-lg rounded-2xl border border-border bg-background p-4 text-foreground shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Instale o sistema no seu dispositivo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenha acesso rápido ao sistema, diretamente pelo ecrã inicial, como numa aplicação.
          </p>
        </div>
        <button type="button" onClick={adiar} aria-label="Fechar convite" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      {helpOpen && (
        <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
          <p className="font-semibold">Como instalar neste dispositivo</p>
          {ios ? (
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>Abra esta página no Safari.</li>
              <li>Toque em <Share className="mx-1 inline h-4 w-4" /> Partilhar.</li>
              <li>Escolha “Adicionar ao ecrã principal”.</li>
              <li>Confirme em “Adicionar”.</li>
            </ol>
          ) : (
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>Abra o menu do navegador <MoreVertical className="mx-1 inline h-4 w-4" />.</li>
              <li>Escolha “Instalar aplicação” ou “Adicionar ao ecrã inicial”.</li>
              <li>Confirme a instalação.</li>
            </ol>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Se a opção não aparecer, atualize o navegador e volte a abrir esta página fora do modo privado.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={adiar} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
          Mais tarde
        </button>
        <button type="button" onClick={() => { if (helpOpen) setHelpOpen(false); else void instalar(); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Download className="h-4 w-4" />
          {helpOpen ? "Entendi" : "Instalar aplicação"}
        </button>
      </div>
    </div>
  );
}
