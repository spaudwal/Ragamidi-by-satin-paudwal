
import { Composition } from "../types";

export interface MidiExportOptions {
  tempo?: number;
  timeSignature?: [number, number];
  tracks: {
    melody: boolean;
    vocal: boolean;
    bass: boolean;
    drums: boolean;
  };
}

/**
 * Standard MIDI VLQ (Variable Length Quantity) encoding
 */
function encodeVLQ(num: number): number[] {
  const bytes: number[] = [];
  let n = Math.floor(num);
  bytes.unshift(n & 0x7F);
  while (n > 127) {
    n >>= 7;
    bytes.unshift((n & 0x7F) | 0x80);
  }
  return bytes;
}

/**
 * Robust MIDI File Generation for RagaMidi
 */
export function exportMidiFile(comp: Composition, options: MidiExportOptions) {
  const PPQ = 480; 
  const bpm = options.tempo || comp.bpm || 110;
  const ticksPerSecond = (bpm / 60) * PPQ;

  const tracks: Uint8Array[] = [];

  // 1. CONDUCTOR TRACK
  const conductorEvents: { time: number; data: number[] }[] = [];
  const msPerBeat = Math.floor(60000000 / bpm);
  conductorEvents.push({
    time: 0,
    data: [0xFF, 0x51, 0x03, (msPerBeat >> 16) & 0xFF, (msPerBeat >> 8) & 0xFF, msPerBeat & 0xFF]
  });
  const [num, den] = options.timeSignature || [4, 4];
  conductorEvents.push({
    time: 0,
    data: [0xFF, 0x58, 0x04, num, Math.floor(Math.log2(den)), 24, 8]
  });
  tracks.push(serializeTrack(conductorEvents));

  // 2. MELODY TRACK (Channel 1)
  if (options.tracks.melody && comp.melody?.length) {
    const events: { time: number; data: number[] }[] = [];
    events.push({ time: 0, data: [0xC0, 104] }); // Sitar
    comp.melody.forEach(n => {
      events.push({ time: Math.floor(n.start * ticksPerSecond), data: [0x90, n.midi, n.velocity] });
      events.push({ time: Math.floor((n.start + n.duration) * ticksPerSecond), data: [0x80, n.midi, 0] });
    });
    tracks.push(serializeTrack(events));
  }

  // 3. VOCAL TRACK (Channel 2)
  if (options.tracks.vocal && comp.vocalTimeline?.length) {
    const events: { time: number; data: number[] }[] = [];
    events.push({ time: 0, data: [0xC1, 54] }); // Voice
    comp.vocalTimeline.forEach(v => {
      events.push({ time: Math.floor(v.time * ticksPerSecond), data: [0x91, v.midi, 100] });
      events.push({ time: Math.floor((v.time + v.duration) * ticksPerSecond), data: [0x81, v.midi, 0] });
    });
    tracks.push(serializeTrack(events));
  }

  // 4. BASS TRACK (Channel 3)
  if (options.tracks.bass && comp.bass?.length) {
    const events: { time: number; data: number[] }[] = [];
    events.push({ time: 0, data: [0xC2, 32] }); // Bass
    comp.bass.forEach(n => {
      events.push({ time: Math.floor(n.start * ticksPerSecond), data: [0x92, n.midi, n.velocity] });
      events.push({ time: Math.floor((n.start + n.duration) * ticksPerSecond), data: [0x82, n.midi, 0] });
    });
    tracks.push(serializeTrack(events));
  }

  // 5. DRUMS TRACK (Channel 10)
  if (options.tracks.drums && comp.drums?.length) {
    const events: { time: number; data: number[] }[] = [];
    comp.drums.forEach(n => {
      events.push({ time: Math.floor(n.start * ticksPerSecond), data: [0x99, n.midiNote, n.velocity] });
      events.push({ time: Math.floor((n.start + n.duration) * ticksPerSecond), data: [0x89, n.midiNote, 0] });
    });
    tracks.push(serializeTrack(events));
  }

  function serializeTrack(events: { time: number; data: number[] }[]): Uint8Array {
    events.sort((a, b) => a.time - b.time);
    let trackBytes: number[] = [];
    let lastTick = 0;
    
    events.forEach(e => {
      const delta = Math.max(0, e.time - lastTick);
      trackBytes.push(...encodeVLQ(delta));
      trackBytes.push(...e.data);
      lastTick = e.time;
    });
    
    // Add End of Track Meta Event
    trackBytes.push(0x00, 0xFF, 0x2F, 0x00);

    const len = trackBytes.length;
    const chunk = new Uint8Array(8 + len);
    // MTrk
    chunk[0] = 0x4d; chunk[1] = 0x54; chunk[2] = 0x72; chunk[3] = 0x6b;
    // Length
    chunk[4] = (len >> 24) & 0xff;
    chunk[5] = (len >> 16) & 0xff;
    chunk[6] = (len >> 8) & 0xff;
    chunk[7] = len & 0xff;
    // Data
    chunk.set(trackBytes, 8);
    return chunk;
  }

  // MThd
  const header = new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // Chunk Length
    0x00, 0x01,             // Format 1
    (tracks.length >> 8) & 0xFF, tracks.length & 0xFF, // Number of tracks
    (PPQ >> 8) & 0xFF, PPQ & 0xFF // Division (PPQ)
  ]);

  // Combine All Tracks
  const totalLength = header.length + tracks.reduce((sum, t) => sum + t.length, 0);
  const finalMidi = new Uint8Array(totalLength);
  
  // Assemble the final MIDI byte array
  finalMidi.set(header, 0);
  let offset = header.length;
  for (const track of tracks) {
    finalMidi.set(track, offset);
    offset += track.length;
  }

  // Trigger download
  const blob = new Blob([finalMidi], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${comp.title.replace(/\s+/g, '_')}.mid`;
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
