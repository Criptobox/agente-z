// dashboard/voice.js
// Integración de Web Speech API para voz a texto y texto a voz.
// 100% gratis, nativo del navegador.

class VoiceAgent {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.listening = false;
    this.speaking = false;
    this.lang = 'es-ES';
    this.rate = 1.1;
    this.voice = null;

    // Cargar voz en español si está disponible
    this._loadVoice();
  }

  _loadVoice() {
    if (!this.synthesis) return;
    const loadVoices = () => {
      const voices = this.synthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es') && v.name.includes('Google'))
        || voices.find(v => v.lang.startsWith('es'))
        || voices.find(v => v.lang.startsWith('es-ES'));
      if (esVoice) this.voice = esVoice;
    };
    loadVoices();
    this.synthesis.onvoiceschanged = loadVoices;
  }

  get isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  get canSpeak() {
    return !!this.synthesis;
  }

  // Inicia reconocimiento de voz
  startListening(onResult, onError, onEnd) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError?.(new Error('Reconocimiento de voz no soportado en este navegador. Usa Chrome o Edge.'));
      return;
    }

    if (this.recognition) this.stopListening();

    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.lang;
    this.recognition.continuous = false; // una frase a la vez
    this.recognition.interimResults = true; // resultados parciales
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (interimTranscript) onResult?.(interimTranscript, false);
      if (finalTranscript) onResult?.(finalTranscript, true);
    };

    this.recognition.onerror = (event) => {
      this.listening = false;
      onError?.(new Error(event.error || 'Error de reconocimiento'));
    };

    this.recognition.onend = () => {
      this.listening = false;
      onEnd?.();
    };

    try {
      this.recognition.start();
      this.listening = true;
    } catch (err) {
      onError?.(err);
    }
  }

  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
      this.listening = false;
    }
  }

  // Lee texto en voz alta
  speak(text, onEnd) {
    if (!this.synthesis) {
      onEnd?.();
      return;
    }
    // Cancelar cualquier speech anterior
    this.synthesis.cancel();

    // Limpiar markdown para que suene natural
    const clean = text
      .replace(/[#*_`~]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → texto
      .replace(/<[^>]+>/g, '') // HTML tags
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = this.lang;
    utterance.rate = this.rate;
    utterance.pitch = 1.0;
    if (this.voice) utterance.voice = this.voice;

    utterance.onstart = () => { this.speaking = true; };
    utterance.onend = () => { this.speaking = false; onEnd?.(); };
    utterance.onerror = () => { this.speaking = false; onEnd?.(); };

    this.synthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.speaking = false;
    }
  }

  setLang(lang) { this.lang = lang; }
  setRate(rate) { this.rate = rate; }
}

// Singleton global (sin export, para compatibilidad con script normal)
var voice = new VoiceAgent();
window.voice = voice;
