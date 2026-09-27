/**
 * Aviso sonoro (dois bipes) gerado pelo navegador, sem arquivo de áudio. O navegador só libera som
 * depois de um clique ou tecla na página: destravarSom() fica esperando o primeiro.
 */
let ctx: AudioContext | null = null;

export function destravarSom() {
  const destravar = () => {
    ctx ??= new AudioContext();
    void ctx.resume();
  };
  window.addEventListener('pointerdown', destravar);
  window.addEventListener('keydown', destravar);
  return () => {
    window.removeEventListener('pointerdown', destravar);
    window.removeEventListener('keydown', destravar);
  };
}

/**
 * Cada aviso tem o seu som, para saber de onde veio sem olhar a tela:
 * whatsapp = dois bipes (conversa aguardando); suporte = três notas subindo, mais suaves (cliente
 * escreveu num chamado).
 */
const SONS: Record<string, { notas: number[]; intervalo: number; duracao: number; onda: OscillatorType; volume?: number }> = {
  whatsapp: { notas: [880, 1175], intervalo: 0.25, duracao: 0.22, onda: 'sine' },
  suporte: { notas: [784, 988, 1319], intervalo: 0.13, duracao: 0.2, onda: 'triangle' },
  // Cutucão do técnico no chat do site: campainha insistente (três toques duplos)
  cutucar: { notas: [1319, 988, 1319, 988, 1319, 988], intervalo: 0.12, duracao: 0.1, onda: 'square', volume: 0.12 },
};

export function tocarAviso(tipo: 'whatsapp' | 'suporte' | 'cutucar' = 'whatsapp') {
  const som = SONS[tipo];
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    som.notas.forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const inicio = t + i * som.intervalo;
      o.type = som.onda;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, inicio);
      g.gain.exponentialRampToValueAtTime(som.volume ?? 0.3, inicio + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, inicio + som.duracao);
      o.connect(g).connect(ctx!.destination);
      o.start(inicio);
      o.stop(inicio + som.duracao + 0.03);
    });
  } catch {
    // navegador sem Web Audio: fica só o aviso na tela
  }
}
