import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Minimal local types for the Web Speech API. It's a real, widely-shipped
// browser API (Chrome/Edge/Safari via the `webkit` prefix), but it isn't
// part of TypeScript's standard DOM typings, so this defines only the
// handful of members actually used here rather than reaching for `any`.
// ---------------------------------------------------------------------------

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechRecognitionStatus = 'idle' | 'listening';

interface UseSpeechRecognitionOptions {
  /** Called with each finalized chunk of speech, relying on the browser's own event.resultIndex to avoid re-emitting the same final text twice. */
  onFinalTranscript: (text: string) => void;
}

interface UseSpeechRecognitionResult {
  isSupported: boolean;
  status: SpeechRecognitionStatus;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

function friendlyErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return 'Microphone access is blocked. Enable it in your browser settings.';
    case 'no-speech':
      return "I didn't catch anything. Try again.";
    case 'audio-capture':
      return "Couldn't access a microphone on this device.";
    case 'aborted':
      return ''; // user-initiated stop — not a real error, nothing to show
    default:
      return "Voice input ran into a problem. Try again.";
  }
}

/**
 * Wraps the browser's Web Speech API for Brain Dump's voice input. This
 * hook only ever produces text — it has no knowledge of Brain Dump's
 * parsing/reminders/date logic, and never talks to Groq or Supabase.
 */
export function useSpeechRecognition({
  onFinalTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;

  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
  const isSupported = SpeechRecognitionCtor !== null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionCtor) {
      setError("Voice input isn't supported on this browser yet.");
      return;
    }
    // Never run two sessions at once — stop/discard any existing one first.
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    setError(null);
    setInterimTranscript('');

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      // event.resultIndex is where NEW or CHANGED results begin for this
      // event — the API's own way of telling us not to re-process
      // anything before it. Iterating from here (not from 0) is what
      // actually prevents re-emitting an already-finalized transcript,
      // which matters especially for WebKit/Safari's indexing behavior.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const finalText = result[0].transcript.trim();
          if (finalText) onFinalTranscriptRef.current(finalText);
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      const message = friendlyErrorMessage(event.error);
      if (message) setError(message);
    };

    recognition.onend = () => {
      setStatus('idle');
      setInterimTranscript('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setStatus('listening');
    try {
      recognition.start();
    } catch {
      setError('Voice input ran into a problem. Try again.');
      setStatus('idle');
      recognitionRef.current = null;
    }
  }, [SpeechRecognitionCtor]);

  // Stop cleanly on unmount (e.g. navigating away from Brain Dump) —
  // never leave the microphone listening in the background.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return { isSupported, status, interimTranscript, error, start, stop };
}
