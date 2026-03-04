
import { GoogleGenAI, Type } from "@google/genai";
import { Raga, Style, Mood, Composition } from "../types";

const compositionSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    melody: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          midi: { type: Type.NUMBER },
          start: { type: Type.NUMBER },
          duration: { type: Type.NUMBER },
          velocity: { type: Type.NUMBER }
        },
        required: ["midi", "start", "duration", "velocity"]
      }
    },
    bass: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          midi: { type: Type.NUMBER },
          start: { type: Type.NUMBER },
          duration: { type: Type.NUMBER },
          velocity: { type: Type.NUMBER }
        }
      }
    },
    drums: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          midiNote: { type: Type.NUMBER },
          start: { type: Type.NUMBER },
          duration: { type: Type.NUMBER },
          velocity: { type: Type.NUMBER }
        }
      }
    },
    vocalTimeline: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.NUMBER },
          midi: { type: Type.NUMBER },
          phoneme: { type: Type.STRING },
          emotion: { type: Type.STRING },
          duration: { type: Type.NUMBER }
        },
        required: ["time", "midi", "phoneme", "duration"]
      }
    },
    lyrics: { type: Type.STRING },
    lyricsTranslation: { type: Type.STRING }
  },
  required: ["title", "melody", "vocalTimeline", "lyrics", "lyricsTranslation"]
};

export async function generateComposition(
  raga: Raga,
  style: Style,
  mood: Mood,
  bpm: number,
  lyricsSeed: string
): Promise<Composition> {
  // Always create a new instance to use the latest API key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Role: Master AI Music Composer & Raga Theoretician.
    Task: Generate a 1-MINUTE LONG song composition. 
    
    COMPOSITION SCALE:
    - Duration: Exactly 60.0 seconds (1:00 minute).
    - Structure: Short form including Intro (5s), Main Theme (25s), Variation (20s), and Outro (10s).
    - Event Density: The vocalTimeline MUST contain a continuous sequence (at least 60-80 events) to cover the full 60-second span.
    - BPM: ${bpm}
    
    MUSICAL RULES:
    1. Scalic Integrity: Every note in melody, bass, and vocalTimeline MUST strictly be from the ${raga} scale.
    2. Stylistic Fusion: Blend traditional Indian classical elements with ${style} aesthetics.
    3. Lyrics: Poetic transliterated Hindi/Urdu.
    4. Translation: English translation for the narrative.
    
    Parameters:
    - Raga: ${raga}
    - Mood: ${mood}
    - Context: ${lyricsSeed}
    
    JSON REQUIREMENTS:
    - Return a complete JSON object matching the schema.
    - Ensure 'time' and 'start' values increment logically up to 60.0 seconds.
  `;

  // Switched to Flash-3 for better quota availability and high-speed JSON generation
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: compositionSchema
    }
  });

  const data = JSON.parse(response.text);
  
  return {
    ...data,
    id: crypto.randomUUID(),
    raga,
    style,
    mood,
    bpm,
    timestamp: Date.now()
  };
}

export async function generateLyrics(raga: Raga, style: Style, mood: Mood): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Generate a short poetic lyric for a Raag ${raga} composition. Style: ${style}, Mood: ${mood}. Output only the lyrics.`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });
  return response.text.trim();
}
