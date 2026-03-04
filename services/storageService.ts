
import { Composition, VocalPreset } from "../types";

const STORAGE_KEY = "ragamidi_compositions";
const PRESET_KEY = "ragamidi_presets";

export function saveToLibrary(comp: Composition) {
  const existing = getLibrary();
  const updated = [comp, ...existing];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getLibrary(): Composition[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function deleteFromLibrary(id: string) {
  const existing = getLibrary();
  const updated = existing.filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function savePreset(preset: VocalPreset) {
  const existing = getPresets();
  const updated = [preset, ...existing.filter(p => p.id !== preset.id)];
  localStorage.setItem(PRESET_KEY, JSON.stringify(updated));
}

export function getPresets(): VocalPreset[] {
  const data = localStorage.getItem(PRESET_KEY);
  return data ? JSON.parse(data) : [];
}

export function deletePreset(id: string) {
  const existing = getPresets();
  const updated = existing.filter(p => p.id !== id);
  localStorage.setItem(PRESET_KEY, JSON.stringify(updated));
}
