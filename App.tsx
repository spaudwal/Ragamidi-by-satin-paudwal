
import React, { useState, useEffect, useRef } from 'react';
import { Raga, Style, Mood, Composition, VocalParams, VocalPreset, Swara } from './types';
import { loadProcessor, createPluginNode, audioContext } from './audioContext';
import { generateComposition, generateLyrics } from './services/geminiService';
import { saveToLibrary, getLibrary, deleteFromLibrary, savePreset, getPresets, deletePreset } from './services/storageService';
import { exportMidiFile, MidiExportOptions } from './services/midiService';
import { getRagaShruti, RAGA_SCALES } from './constants';

export default function App() {
  const [activeComp, setActiveComp] = useState<Composition | null>(null);
  const [library, setLibrary] = useState<Composition[]>([]);
  const [presets, setPresets] = useState<VocalPreset[]>([]);
  const [raga, setRaga] = useState<Raga>(Raga.Shivaranjani);
  const [style, setStyle] = useState<Style>(Style.Classical);
  const [mood, setMood] = useState<Mood>(Mood.Sad);
  const [lyricsSeed, setLyricsSeed] = useState("");
  const [vocalParams, setVocalParams] = useState<VocalParams>({
    vibrato: 0.5,
    grit: 0.1,
    ornamentation: "meend",
    timbre: "kishore",
    gender: "male"
  });
  const [newPresetName, setNewPresetName] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [exportOptions, setExportOptions] = useState<MidiExportOptions>({
    tempo: 110,
    timeSignature: [4, 4],
    tracks: { melody: true, vocal: true, bass: true, drums: true }
  });
  const [showMidiSettings, setShowMidiSettings] = useState(false);

  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackTimersRef = useRef<number[]>([]);
  const animationRef = useRef<number>(null);

  useEffect(() => {
    checkApiKey();
    setLibrary(getLibrary());
    setPresets(getPresets());
    return () => {
      playbackTimersRef.current.forEach(clearTimeout);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const checkApiKey = async () => {
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    setHasApiKey(hasKey);
  };

  const handleOpenKeySelection = async () => {
    // @ts-ignore
    await window.aistudio.openSelectKey();
    setHasApiKey(true);
  };

  const initEngine = async () => {
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    const success = await loadProcessor();
    if (success) {
      const node = createPluginNode();
      const analyser = audioContext.createAnalyser();
      node.connect(analyser);
      analyser.connect(audioContext.destination);
      workletNodeRef.current = node;
      analyserRef.current = analyser;
      setIsReady(true);
      drawVisualizer();
      return true;
    }
    return false;
  };

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      
      const themeColor = style === Style.WizardRock ? '#a855f7' : '#f97316';
      
      const barWidth = (canvasRef.current!.width / bufferLength) * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvasRef.current!.height;
        
        const gradient = ctx.createLinearGradient(0, canvasRef.current!.height, 0, canvasRef.current!.height - barHeight);
        gradient.addColorStop(0, themeColor);
        gradient.addColorStop(0.5, themeColor + '88');
        gradient.addColorStop(1, '#ffffff');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvasRef.current!.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
      animationRef.current = requestAnimationFrame(render);
    };
    render();
  };

  const playComposition = (compToPlay?: Composition) => {
    const comp = compToPlay || activeComp;
    if (!comp || !workletNodeRef.current) return;

    playbackTimersRef.current.forEach(clearTimeout);
    playbackTimersRef.current = [];
    workletNodeRef.current.port.postMessage({ gain: 0 });
    setPlaybackProgress(0);

    setIsPlaying(true);
    const shruti = getRagaShruti(comp.raga);
    const startTime = Date.now();

    comp.vocalTimeline.forEach(entry => {
      const startTimer = window.setTimeout(() => {
        workletNodeRef.current?.port.postMessage({
          freq: 440 * Math.pow(2, (entry.midi - 69) / 12),
          tonic: 440 * Math.pow(2, (60 - 69) / 12), 
          ragaShruti: shruti,
          phoneme: entry.phoneme,
          bhakti: comp.mood === Mood.Bhakti,
          gender: vocalParams.gender,
          gamak: vocalParams.ornamentation === "gamak",
          gain: 1.0
        });
      }, entry.time * 1000);
      playbackTimersRef.current.push(startTimer);

      const endTimer = window.setTimeout(() => {
        workletNodeRef.current?.port.postMessage({ gain: 0 });
      }, (entry.time + entry.duration - 0.005) * 1000);
      playbackTimersRef.current.push(endTimer);
    });

    const lastEvent = comp.vocalTimeline[comp.vocalTimeline.length - 1];
    const totalDuration = (lastEvent?.time || 0) + (lastEvent?.duration || 0);

    const progressInterval = window.setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min((elapsed / totalDuration) * 100, 100);
      setPlaybackProgress(progress);
      if (progress >= 100) clearInterval(progressInterval);
    }, 50);
    playbackTimersRef.current.push(progressInterval);

    const finishTimer = window.setTimeout(() => {
      setIsPlaying(false);
      setPlaybackProgress(0);
      workletNodeRef.current?.port.postMessage({ gain: 0 });
    }, totalDuration * 1000 + 1000);
    playbackTimersRef.current.push(finishTimer);
  };

  const handleGenerate = async () => {
    if (!isReady) {
      const ok = await initEngine();
      if (!ok) return;
    }

    setGenError(null);
    setIsGenerating(true);
    try {
      const comp = await generateComposition(raga, style, mood, 110, lyricsSeed);
      setActiveComp(comp);
      setExportOptions(prev => ({ ...prev, tempo: comp.bpm }));
      playComposition(comp);
    } catch (err: any) {
      console.error("Generation failed:", err);
      const errStr = JSON.stringify(err);
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
        setGenError("Quota limit reached. Please wait a few seconds before retrying, or switch to a paid project API key.");
      } else if (errStr.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setGenError("The selected API key is invalid or the model is not found.");
      } else {
        setGenError("Synthesis failed. Try refining your prompt or checking your network.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShuffleRaga = () => {
    const ragaValues = Object.values(Raga).filter(r => r !== Raga.Custom);
    const randomRaga = ragaValues[Math.floor(Math.random() * ragaValues.length)];
    setRaga(randomRaga);
  };

  const getSwaras = (r: Raga) => {
    const scale = RAGA_SCALES[r] || [];
    const names = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];
    return scale.map(s => names[s]).join(" - ");
  };

  const getSuggestedChords = (r: Raga) => {
    if (r === Raga.Shivaranjani) return ["Am", "C", "D", "F (drone)"];
    if (r === Raga.Yaman) return ["G", "D", "C", "F#m7b5"];
    return ["Drone Sa-Pa", "Drone Sa-Ma"];
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-[#060608] flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-[3rem] max-w-xl w-full text-center space-y-8 border-orange-500/20 shadow-[0_0_100px_rgba(234,88,12,0.1)]">
          <div className="w-20 h-20 bg-orange-600 rounded-2xl mx-auto flex items-center justify-center text-white text-4xl font-black">!</div>
          <h2 className="text-3xl font-black text-white tracking-tighter">Setup Required</h2>
          <p className="text-white/40 leading-relaxed">
            RagaMidi Studio V3 requires an API key selection. High-tier models perform best with a paid project key.
          </p>
          <button 
            onClick={handleOpenKeySelection}
            className="w-full py-5 bg-white text-black font-black rounded-2xl hover:bg-white/90 transition-all uppercase tracking-widest text-xs"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 md:p-8 transition-all duration-1000 ${style === Style.WizardRock ? 'bg-[#120a2e]' : 'bg-[#060608]'}`}>
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-12 gap-4">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-700 rounded-[1.25rem] flex items-center justify-center font-bold text-white text-4xl shadow-[0_15px_40px_-10px_rgba(234,88,12,0.5)]">R</div>
          <div>
            <h1 className="text-4xl font-bold font-outfit text-white tracking-tighter flex items-center gap-2">
              <span>RagaMidi</span>
              <span className="text-[10px] font-black bg-white/10 px-3 py-1 rounded-full uppercase tracking-widest text-white/40 border border-white/5">Studio V3</span>
            </h1>
            <p className="text-white/20 text-xs mt-1 font-semibold tracking-[0.2em] uppercase">Neural Syllabic Synth Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleOpenKeySelection}
            className="px-6 py-3 bg-white/5 text-white/40 border border-white/10 rounded-full hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            Switch API Key
          </button>
          {!isReady ? (
            <button 
              onClick={initEngine}
              className="px-10 py-4 bg-white text-black font-black rounded-full hover:bg-white/90 transition-all shadow-[0_20px_40px_-15px_rgba(255,255,255,0.2)] active:scale-95 text-xs uppercase tracking-widest"
            >
              Connect Sound Engine
            </button>
          ) : (
            <div className="flex items-center gap-4 px-8 py-3 bg-white/5 rounded-full border border-white/10">
               <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse"></div>
               <span className="text-[11px] font-black text-white/50 uppercase tracking-[0.3em]">Ready</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <section className="glass-panel p-8 rounded-[2.5rem] border-white/5 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/20">Creative Console</h2>
              <button onClick={handleShuffleRaga} className="p-2 text-white/20 hover:text-orange-500 transition-all duration-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-white/30 block font-black">Raga Profile</label>
                <select value={raga} onChange={(e) => setRaga(e.target.value as Raga)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none appearance-none font-bold">
                  {Object.values(Raga).sort().map(r => <option key={r} value={r} className="bg-[#0f0f12]">{r}</option>)}
                </select>
              </div>
              <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl space-y-3 text-center">
                <p className="text-[9px] uppercase tracking-widest text-orange-500 font-black">Raga Scale</p>
                <p className="text-xl font-bold text-white tracking-widest">{getSwaras(raga)}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/30 block font-black">Style</label>
                  <select value={style} onChange={(e) => setStyle(e.target.value as Style)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[11px] appearance-none font-bold">
                    {Object.values(Style).map(s => <option key={s} value={s} className="bg-[#0f0f12]">{s}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/30 block font-black">Mood</label>
                  <select value={mood} onChange={(e) => setMood(e.target.value as Mood)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[11px] appearance-none font-bold">
                    {Object.values(Mood).map(m => <option key={m} value={m} className="bg-[#0f0f12]">{m}</option>)}
                  </select>
                </div>
              </div>
              <textarea value={lyricsSeed} onChange={(e) => setLyricsSeed(e.target.value)} placeholder="Describe your theme..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-xs h-32 focus:outline-none placeholder:text-white/10 resize-none font-medium leading-relaxed"/>
              {genError && <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-[10px] text-red-400 font-bold leading-relaxed">{genError}</div>}
              <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all text-[11px] uppercase tracking-[0.3em]">
                {isGenerating ? "Synthesizing..." : "Generate composition"}
              </button>
            </div>
          </section>

          <section className="glass-panel p-8 rounded-[2.5rem] border-white/5">
            <h2 className="text-[11px] font-black uppercase tracking-[0.4em] mb-8 text-white/20">Vocal controls</h2>
            <div className="space-y-6">
              <div className="flex gap-2 p-1 bg-white/5 rounded-2xl">
                {['male', 'female'].map(g => (
                  <button key={g} onClick={() => setVocalParams({...vocalParams, gender: g as any})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${vocalParams.gender === g ? 'bg-white/10 text-white' : 'text-white/20'}`}>{g}</button>
                ))}
              </div>
              <div className="space-y-4">
                {['vibrato', 'grit'].map(p => (
                  <div key={p} className="space-y-2">
                    <div className="flex justify-between items-center"><label className="text-[9px] uppercase tracking-widest text-white/30 font-black">{p}</label><span className="text-[10px] text-white/60">{(vocalParams as any)[p]}</span></div>
                    <input type="range" min="0" max="1" step="0.1" value={(vocalParams as any)[p]} onChange={(e) => setVocalParams({...vocalParams, [p]: parseFloat(e.target.value)})} className="w-full accent-orange-600 h-1 bg-white/10 rounded-full appearance-none"/>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-6 space-y-6">
          <div className="glass-panel rounded-[4rem] p-12 min-h-[750px] flex flex-col relative group overflow-hidden border-white/10 shadow-2xl">
            {activeComp ? (
              <>
                <div className="flex justify-between items-start mb-16 z-10">
                  <div className="space-y-4">
                    <h3 className="text-7xl font-black font-outfit text-white tracking-tighter leading-[0.9]">{activeComp.title}</h3>
                    <div className="flex gap-4">
                      <div className="px-6 py-2.5 bg-orange-600/10 border border-orange-500/20 rounded-full flex items-center gap-3">
                        <span className="text-[12px] font-black text-orange-500 uppercase tracking-[0.3em]">Raag {activeComp.raga}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-5">
                    <button onClick={() => { saveToLibrary(activeComp); setLibrary(getLibrary()); }} className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white/20 hover:text-white transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button>
                    <button onClick={() => setShowMidiSettings(!showMidiSettings)} className="px-8 h-16 bg-white text-black font-black text-[12px] uppercase tracking-[0.3em] rounded-full hover:bg-white/90 transition-all flex items-center gap-4">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      MIDI
                    </button>
                  </div>
                </div>

                {showMidiSettings && (
                  <div className="absolute right-12 top-44 z-30 w-[22rem] p-10 glass-panel rounded-[3rem] shadow-2xl border-orange-500/40 animate-in fade-in zoom-in backdrop-blur-3xl">
                    <h4 className="text-[11px] font-black text-white/30 uppercase tracking-[0.5em] mb-10 text-center">Export Configuration</h4>
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><label className="text-[10px] text-white/40 uppercase font-black">BPM</label><input type="number" value={exportOptions.tempo} onChange={e => setExportOptions({...exportOptions, tempo: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white"/></div>
                        <div className="space-y-2"><label className="text-[10px] text-white/40 uppercase font-black">Sig</label><div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-2 py-4"><input type="number" value={exportOptions.timeSignature![0]} onChange={e => setExportOptions({...exportOptions, timeSignature: [parseInt(e.target.value), exportOptions.timeSignature![1]]})} className="w-full bg-transparent text-center focus:outline-none"/><span className="text-white/20">/</span><input type="number" value={exportOptions.timeSignature![1]} onChange={e => setExportOptions({...exportOptions, timeSignature: [exportOptions.timeSignature![0], parseInt(e.target.value)]})} className="w-full bg-transparent text-center focus:outline-none"/></div></div>
                      </div>
                      <button onClick={() => { exportMidiFile(activeComp, exportOptions); setShowMidiSettings(false); }} className="w-full py-6 bg-orange-600 hover:bg-orange-500 text-white rounded-[1.5rem] text-[12px] font-black uppercase tracking-[0.4em]">Download .MID</button>
                    </div>
                  </div>
                )}

                <div className="flex-1 bg-white/[0.04] rounded-[4rem] relative overflow-hidden flex items-center justify-center border border-white/5">
                  <canvas ref={canvasRef} width={800} height={500} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-xl">
                    <button onClick={() => playComposition()} disabled={isPlaying} className="w-48 h-48 bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-90 transition-all">
                      {isPlaying ? <div className="h-12 w-12 flex gap-2"><div className="w-2 h-full bg-black animate-pulse"></div><div className="w-2 h-full bg-black animate-pulse delay-75"></div></div> : <svg className="w-16 h-16 ml-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/5"><div className="h-full bg-orange-600" style={{ width: `${playbackProgress}%` }}/></div>
                </div>

                <div className="mt-12 text-center space-y-8">
                  <p className="text-5xl font-outfit text-white font-black italic">"{activeComp.lyrics}"</p>
                  <p className="text-xl text-white/30 font-light italic">{activeComp.lyricsTranslation}</p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                <div className="w-64 h-64 border border-white/5 rounded-full flex items-center justify-center animate-pulse"><svg className="w-20 h-20 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg></div>
                <h3 className="mt-12 text-white font-black text-4xl">Studio Standby</h3>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <section className="glass-panel p-10 rounded-[3rem] border-white/5 h-full flex flex-col min-h-[750px]">
            <h4 className="text-[12px] font-black text-white/30 uppercase tracking-[0.6em] mb-12">Archive</h4>
            <div className="space-y-4 flex-1 overflow-y-auto pr-2">
              {library.map(comp => (
                <div key={comp.id} className="p-6 bg-white/5 rounded-[2rem] flex flex-col gap-2 group hover:bg-white/10 transition-all relative border border-transparent hover:border-white/5">
                  <div onClick={() => { setActiveComp(comp); playComposition(comp); }} className="cursor-pointer">
                    <p className="text-white font-bold truncate">{comp.title}</p>
                    <p className="text-[10px] text-white/20 uppercase tracking-widest mt-1">Raag {comp.raga}</p>
                  </div>
                  <button onClick={() => { deleteFromLibrary(comp.id); setLibrary(getLibrary()); }} className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 text-white/10 hover:text-red-500 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
