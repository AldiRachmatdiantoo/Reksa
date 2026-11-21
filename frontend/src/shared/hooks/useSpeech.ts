import { useCallback, useEffect, useState } from 'react';

type SpeechState = 'idle' | 'speaking' | 'unsupported' | 'error';

/** Membacakan teks dengan Web Speech API (suara Bahasa Indonesia jika ada). */
export function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [state, setState] = useState<SpeechState>(supported ? 'idle' : 'unsupported');

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const toggle = useCallback(
    (text: string) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      if (synth.speaking) {
        synth.cancel();
        setState('idle');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('id'));
      if (voice) utterance.voice = voice;
      utterance.onend = () => setState('idle');
      utterance.onerror = (e) => setState(e.error === 'canceled' || e.error === 'interrupted' ? 'idle' : 'error');
      setState('speaking');
      synth.speak(utterance);
    },
    [supported],
  );

  return { state, toggle };
}
