
export const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
  sampleRate: 44100,
  latencyHint: 'interactive'
});

let workletLoaded = false;

export async function loadProcessor() {
  if (workletLoaded) return true;

  const WORKLET_CODE = `
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    class PitchSmoother {
      constructor() { this.current = 220; }
      step(target) {
        const diff = target - this.current;
        this.current += diff * 0.005; 
        return this.current;
      }
    }

    class GlottalSource {
      constructor(sr) {
        this.sr = sr;
        this.phase = 0;
      }
      process(freq) {
        if (freq <= 0) return 0;
        const T = this.sr / freq;
        this.phase++;
        if (this.phase >= T) this.phase = 0;

        const open = 0.4 * T;
        const close = 0.16 * T;

        if (this.phase < open) {
          const x = this.phase / open;
          return 0.5 * (1 - Math.cos(Math.PI * x));
        }
        if (this.phase < open + close) {
          const x = (this.phase - open) / close;
          return Math.cos(Math.PI * x);
        }
        return 0;
      }
    }

    class BandPass {
      constructor(sr) {
        this.sr = sr;
        this.y1 = this.y2 = 0;
      }
      set(f, bw) {
        const w = 2 * Math.PI * f / this.sr;
        const r = Math.exp(-Math.PI * bw / this.sr);
        this.a1 = 2 * r * Math.cos(w);
        this.a2 = -r * r;
        this.b0 = 1 - r;
      }
      process(x) {
        const y = this.b0 * x + this.a1 * this.y1 + this.a2 * this.y2;
        this.y2 = this.y1;
        this.y1 = y;
        return y;
      }
    }

    class FormantFilter {
      constructor(sr) {
        this.sr = sr;
        this.bands = Array.from({ length: 5 }, () => new BandPass(sr));
        this.vowelData = {
          aa: [700, 1220, 2600, 3500, 4500],
          ee: [300, 2200, 3000, 3600, 4200],
          oo: [400, 800, 2400, 3200, 4000]
        };
        this.setVowel("aa");
      }
      setVowel(v) {
        const freqs = this.vowelData[v] || this.vowelData.aa;
        freqs.forEach((f, i) => this.bands[i].set(f, 90 + i * 50));
      }
      process(x, gain = 1.0) {
        return this.bands.reduce((s, b) => s + b.process(x), 0) * 0.25 * gain;
      }
    }

    class VocalProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.pitch = new PitchSmoother();
        this.glottal = new GlottalSource(sampleRate);
        this.formant = new FormantFilter(sampleRate);
        
        this.state = {
          freq: 220,
          tonic: 220,
          ragaShruti: [0, 200, 400, 500, 700, 900, 1100],
          gamak: false,
          phoneme: "aa",
          bhakti: false,
          gender: "male",
          gain: 0 // New gain control
        };
        
        this.currentGain = 0;
        this.time = 0;
        this.port.onmessage = e => Object.assign(this.state, e.data);
      }

      snapToRaga(freq) {
        if (freq <= 0) return 0;
        const cents = 1200 * Math.log2(freq / this.state.tonic);
        let best = cents, min = 1e9;
        for (const s of this.state.ragaShruti) {
          const d = Math.abs(cents - s);
          if (d < min) { min = d; best = s; }
        }
        return this.state.tonic * Math.pow(2, best / 1200);
      }

      process(_, outputs) {
        const out = outputs[0][0];
        const { freq, gamak, phoneme, bhakti, gender, gain } = this.state;

        for (let i = 0; i < out.length; i++) {
          // Smooth gain to prevent clicks
          this.currentGain += (gain - this.currentGain) * 0.005;

          let f = this.snapToRaga(freq);
          if (gamak && f > 0) {
            f *= (1 + 0.015 * Math.sin(2 * Math.PI * 6.5 * this.time));
          }
          
          const targetFreq = this.pitch.step(f);
          let sig = this.glottal.process(targetFreq);
          
          this.formant.setVowel(phoneme === "ka" || phoneme === "ta" ? "aa" : phoneme);
          
          let fGain = bhakti ? 1.15 : 1.0;
          if (gender === "female") fGain *= 0.8;

          sig = this.formant.process(sig, fGain);

          if (bhakti && this.currentGain > 0.01) {
            sig += (Math.random() * 2 - 1) * 0.04;
            sig = Math.tanh(sig * 2.2);
          }

          out[i] = sig * 0.4 * this.currentGain;
          this.time += 1 / sampleRate;
        }
        return true;
      }
    }

    registerProcessor("vocal-processor", VocalProcessor);
  `;

  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  
  try {
    await audioContext.audioWorklet.addModule(url);
    workletLoaded = true;
    return true;
  } catch (err) {
    console.error("Failed to load AudioWorklet", err);
    return false;
  }
}

export function createPluginNode() {
  return new AudioWorkletNode(audioContext, "vocal-processor");
}
