import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/dados";
import { Clock } from "lucide-react";

type Usage = {
  enabled: boolean;
  used_seconds: number;
  limit_seconds: number;
  remaining_seconds: number;
  session_active: boolean;
};

export function TeacherUsageTimer() {
  const { data: me } = useMe();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const busy = useRef(false);
  const lastActivity = useRef(Date.now());

  const pause = useCallback(async () => {
    if (!active.current || busy.current) return;
    busy.current = true;
    try {
      await (supabase as any).rpc("teacher_usage_pause");
      active.current = false;
      setUsage((old) => old ? { ...old, session_active: false } : old);
    } finally {
      busy.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    if (active.current || busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const { data, error } = await (supabase as any).rpc("teacher_usage_start");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setUsage(row);
        setRemaining(row.remaining_seconds);
        active.current = !!row.session_active;
        setMessage("");
      }
    } catch (error) {
      active.current = false;
      setMessage((error as Error).message || "Acesso não autorizado.");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!me?.isProfessor || me.isStaff || me.isCoordenador) return;
    void start();
    const activity = () => {
      lastActivity.current = Date.now();
      if (!active.current) void start();
    };
    const heartbeat = window.setInterval(async () => {
      if (!active.current || busy.current) return;
      if (document.visibilityState !== "visible" || Date.now() - lastActivity.current > 60000) {
        await pause();
        return;
      }
      busy.current = true;
      try {
        const { data, error } = await (supabase as any).rpc("teacher_usage_heartbeat");
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setUsage(row);
          setRemaining(row.remaining_seconds);
          active.current = !!row.session_active;
        }
      } catch (error) {
        active.current = false;
        setMessage((error as Error).message || "Sessão pausada.");
      } finally {
        busy.current = false;
      }
    }, 20000);
    const visibility = () => {
      if (document.visibilityState !== "visible") void pause();
      else {
        lastActivity.current = Date.now();
        void start();
      }
    };
    const close = () => { void (supabase as any).rpc("teacher_usage_pause"); };
    ["pointerdown", "keydown", "touchstart", "scroll"].forEach((event) => window.addEventListener(event, activity, { passive: true }));
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", close);
    return () => {
      window.clearInterval(heartbeat);
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((event) => window.removeEventListener(event, activity));
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", close);
      void pause();
    };
  }, [me?.id, me?.isProfessor, me?.isStaff, me?.isCoordenador, start, pause]);

  useEffect(() => {
    if (!usage?.session_active || remaining <= 0) return;
    const id = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [usage?.session_active, remaining > 0]);

  if (!me?.isProfessor || me.isStaff || me.isCoordenador) return null;
  const fmt = (n: number) => `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-2 rounded-md bg-background/15 px-3 py-1.5 text-xs font-semibold text-white" aria-live="polite">
      <Clock className="h-4 w-4" />
      <span>Tempo: {fmt(remaining)}</span>
      <span className="opacity-75">{usage?.session_active ? "em utilização" : "pausado"}</span>
      {message && <span className="max-w-56 truncate text-amber-200" title={message}>{message}</span>}
    </div>
  );
}
