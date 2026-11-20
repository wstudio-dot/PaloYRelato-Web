class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private musicEnabled = true;
  private musicPlaying = false;
  private musicMode: 'title' | 'shop' | 'act0' | 'act1' | 'act2' | 'act3' = 'title';
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private currentStep = 0;

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopMusicLoopOnly();
    } else if (this.musicEnabled && this.musicPlaying) {
      this.startMusicLoopOnly();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopMusicLoopOnly();
    } else if (!this.muted && this.musicPlaying) {
      this.startMusicLoopOnly();
    }
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public unlock() {
    const ctx = this.ensureCtx();
    if (ctx && this.musicEnabled && !this.muted && !this.musicPlaying) {
      this.startMusic();
    }
  }

  public setMusicMode(mode: 'title' | 'shop' | 'act0' | 'act1' | 'act2' | 'act3') {
    this.musicMode = mode;
  }

  public startMusic() {
    this.musicPlaying = true;
    if (this.musicEnabled && !this.muted) {
      this.startMusicLoopOnly();
    }
  }

  public stopMusic() {
    this.musicPlaying = false;
    this.stopMusicLoopOnly();
  }

  private visibilityBound = false;

  private bindVisibilityHandler() {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopMusicLoopOnly();
      } else if (this.musicEnabled && !this.muted && this.musicPlaying) {
        this.startMusicLoopOnly();
      }
    });
  }

  private startMusicLoopOnly() {
    if (this.schedulerId !== null || typeof window === 'undefined') return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.bindVisibilityHandler();
    this.nextStepTime = ctx.currentTime + 0.06;
    this.schedulerId = window.setInterval(() => this.scheduleMusicSteps(), 110);
  }

  private stopMusicLoopOnly() {
    if (this.schedulerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private scheduleMusicSteps() {
    if (this.muted || !this.musicEnabled || !this.musicPlaying) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const bpmByMode: Record<typeof this.musicMode, number> = {
      title: 112,
      shop: 104,
      act0: 126,
      act1: 132,
      act2: 122,
      act3: 140,
    };
    const bpm = bpmByMode[this.musicMode];
    const stepDur = 60 / bpm / 2; // 8th-note groove

    while (this.nextStepTime < ctx.currentTime + 0.22) {
      this.playMusicStep(ctx, this.currentStep, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.currentStep = (this.currentStep + 1) % 16;
    }
  }

  private playMusicStep(ctx: AudioContext, step: number, when: number, stepDur: number) {
    // Lightweight kick on downbeats only (zero high-freq square hats)
    const isActiveAction = this.musicMode.startsWith('act');
    if (step % 4 === 0) {
      this.schedulePercKick(ctx, when, isActiveAction ? 0.085 : 0.045);
    }

    // Bassline progressions by mode
    const bassPatterns: Record<typeof this.musicMode, number[]> = {
      title: [130.81, 0, 164.81, 0, 146.83, 0, 196.0, 0, 110.0, 0, 130.81, 0, 98.0, 0, 123.47, 0],
      shop: [130.81, 0, 196.0, 0, 146.83, 0, 174.61, 0, 164.81, 0, 196.0, 0, 146.83, 0, 130.81, 0],
      act0: [130.81, 0, 155.56, 0, 174.61, 0, 196.0, 0, 116.54, 0, 130.81, 0, 146.83, 0, 155.56, 0],
      act1: [146.83, 0, 146.83, 174.61, 196.0, 0, 146.83, 0, 130.81, 0, 130.81, 164.81, 196.0, 0, 220.0, 0],
      act2: [130.81, 0, 196.0, 0, 98.0, 0, 196.0, 0, 110.0, 0, 164.81, 0, 87.31, 0, 174.61, 0],
      act3: [110.0, 0, 164.81, 0, 130.81, 0, 196.0, 0, 98.0, 0, 146.83, 0, 87.31, 110.0, 130.81, 0],
    };

    const bassFreq = bassPatterns[this.musicMode][step];
    if (bassFreq > 0) {
      this.scheduleSynthNote(ctx, bassFreq, when, stepDur * 0.85, 'triangle', 0.055);
    }

    // 3. Lead melody arpeggio
    const leadPatterns: Record<typeof this.musicMode, number[]> = {
      title: [523.25, 0, 659.25, 587.33, 523.25, 0, 392.0, 0, 440.0, 0, 523.25, 659.25, 587.33, 0, 493.88, 0],
      shop: [392.0, 440.0, 523.25, 0, 587.33, 523.25, 440.0, 0, 392.0, 523.25, 659.25, 0, 587.33, 0, 523.25, 0],
      act0: [523.25, 622.25, 698.46, 0, 783.99, 0, 698.46, 622.25, 587.33, 0, 622.25, 698.46, 783.99, 0, 932.33, 0],
      act1: [587.33, 0, 698.46, 880.0, 0, 783.99, 698.46, 0, 659.25, 0, 783.99, 880.0, 1046.5, 0, 880.0, 0],
      act2: [523.25, 0, 659.25, 783.99, 587.33, 0, 783.99, 0, 440.0, 0, 523.25, 659.25, 698.46, 0, 523.25, 0],
      act3: [440.0, 523.25, 659.25, 880.0, 783.99, 659.25, 523.25, 659.25, 587.33, 698.46, 880.0, 783.99, 659.25, 587.33, 523.25, 440.0],
    };

    const leadFreq = leadPatterns[this.musicMode][step];
    if (leadFreq > 0) {
      const vol = this.musicMode === 'title' || this.musicMode === 'shop' ? 0.028 : 0.036;
      this.scheduleSynthNote(ctx, leadFreq, when, stepDur * 0.72, 'sine', vol);
    }
  }

  private scheduleSynthNote(
    ctx: AudioContext,
    freq: number,
    when: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private schedulePercKick(ctx: AudioContext, when: number, volume: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.09);

    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.12);
  }

  private scheduleHiHat(ctx: AudioContext, when: number, volume: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(5200, when);

    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0005, when + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.035);
  }

  public playTone(
    freq: number,
    duration = 0.12,
    type: OscillatorType = 'triangle',
    volume = 0.14,
    slideToFreq?: number
  ) {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideToFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playCoffeeSlurp() {
    this.playTone(380, 0.08, 'sine', 0.14, 620);
    setTimeout(() => this.playTone(680, 0.12, 'triangle', 0.12, 880), 45);
  }

  public playCoinPickup() {
    this.playTone(987.77, 0.06, 'sine', 0.11);
    setTimeout(() => this.playTone(1318.51, 0.11, 'sine', 0.11), 50);
  }

  public playShopBuy() {
    this.playTone(523.25, 0.07, 'triangle', 0.13);
    setTimeout(() => this.playTone(659.25, 0.07, 'triangle', 0.13), 55);
    setTimeout(() => this.playTone(1046.5, 0.15, 'triangle', 0.14), 110);
  }

  public playTriviaCorrect() {
    this.playTone(587.33, 0.08, 'triangle', 0.14);
    setTimeout(() => this.playTone(739.99, 0.08, 'triangle', 0.14), 70);
    setTimeout(() => this.playTone(880.0, 0.18, 'triangle', 0.15), 140);
  }

  public playTriviaWrong() {
    this.playTone(230, 0.14, 'sawtooth', 0.11, 150);
  }

  public playPowerUp() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 0.11, 'triangle', 0.12), i * 45);
    });
  }

  public playImpulseHit() {
    this.playTone(170, 0.18, 'sawtooth', 0.16, 72);
    setTimeout(() => this.playTone(110, 0.16, 'square', 0.1, 55), 35);
  }

  public playThoughtBlast() {
    this.playTone(540, 0.07, 'triangle', 0.12, 240);
  }

  public playKnowledgeCatch() {
    this.playTone(523.25, 0.09, 'sine', 0.13);
    setTimeout(() => this.playTone(659.25, 0.09, 'sine', 0.13), 50);
    setTimeout(() => this.playTone(783.99, 0.14, 'triangle', 0.13), 100);
  }

  public playGuitarChord(lane: 0 | 1 | 2) {
    const chords: number[][] = [
      [261.63, 329.63, 392.0],
      [349.23, 440.0, 523.25],
      [392.0, 493.88, 587.33],
    ];
    const notes = chords[lane] ?? chords[0];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.24, 'triangle', 0.09);
      }, idx * 24);
    });
  }

  public playMissedNote() {
    this.playTone(195, 0.15, 'sawtooth', 0.11, 140);
  }

  public playShieldBlock() {
    this.playTone(620, 0.08, 'square', 0.1, 920);
  }

  public playActTransition() {
    this.playTone(280, 0.14, 'sine', 0.11, 440);
    setTimeout(() => this.playTone(440, 0.16, 'triangle', 0.1, 660), 90);
  }

  public playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 0.22, 'triangle', 0.13), i * 85);
    });
  }

  public playGameOver() {
    const notes = [330, 277.18, 220, 164.81];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 0.22, 'sawtooth', 0.11), i * 100);
    });
  }
}

export const soundEngine = new SoundEngine();
