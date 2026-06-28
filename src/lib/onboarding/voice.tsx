import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

interface VoiceCtx {
  ttsEnabled: boolean;
  toggleTts: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  sttSupported: boolean;
  ttsSupported: boolean;
  listening: boolean;
  startListening: (onResult: (text: string, final: boolean) => void) => void;
  stopListening: () => void;
}

const Ctx = createContext<VoiceCtx | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("onb.tts") === "1";
  });
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const sttSupported = !!getRecognitionCtor();

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("onb.tts", ttsEnabled ? "1" : "0");
    if (!ttsEnabled && ttsSupported) window.speechSynthesis.cancel();
  }, [ttsEnabled, ttsSupported]);

  const speak = useCallback((text: string) => {
    if (!ttsSupported || !ttsEnabled || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en-(GB|US)/i.test(v.lang) && /Google|Microsoft|Samantha|Daniel/i.test(v.name)) || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) u.voice = preferred;
    window.speechSynthesis.speak(u);
  }, [ttsEnabled, ttsSupported]);

  const cancelSpeech = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
  }, [ttsSupported]);

  const startListening = useCallback((onResult: (text: string, final: boolean) => void) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    try { recRef.current?.stop(); } catch {}
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) onResult(final.trim(), true);
      else if (interim) onResult(interim.trim(), false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }, []);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  }, []);

  return (
    <Ctx.Provider value={{
      ttsEnabled, toggleTts: () => setTtsEnabled((v) => !v),
      speak, cancelSpeech, sttSupported, ttsSupported,
      listening, startListening, stopListening,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useVoice() {
  const v = useContext(Ctx);
  if (!v) throw new Error("VoiceProvider missing");
  return v;
}
