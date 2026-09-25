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

export function tocarAviso() {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const inicio = t + i * 0.25;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, inicio);
      g.gain.exponentialRampToValueAtTime(0.3, inicio + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.22);
      o.connect(g).connect(ctx!.destination);
      o.start(inicio);
      o.stop(inicio + 0.25);
    });
  } catch {
    // navegador sem Web Audio: fica só o aviso na tela
  }
}
