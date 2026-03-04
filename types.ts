
export enum Raga {
  Abhogi = "Abhogi",
  Adana = "Adana",
  AhirBhairav = "Ahir Bhairav",
  AlhaiyaBilaval = "Alhaiya Bilaval",
  Asavari = "Asavari",
  Bageshri = "Bageshri",
  Bahar = "Bahar",
  Basant = "Basant",
  Bhairav = "Bhairav",
  Bhairavi = "Bhairavi",
  Bhatiyar = "Bhatiyar",
  Bhimpalasi = "Bhimpalasi",
  BhupalTodi = "Bhupal Todi",
  Bhupali = "Bhupali",
  Bibhas = "Bibhas",
  Bihag = "Bihag",
  BilaskhaniTodi = "Bilaskhani Todi",
  BrindabaniSarang = "Brindabani Sarang",
  Chandrakauns = "Chandrakauns",
  Chayanat = "Chayanat",
  DarbariKanada = "Darbari Kanada",
  Desh = "Desh",
  Deshi = "Deshi",
  Dhani = "Dhani",
  Durga = "Durga",
  GaudMalhar = "Gaud Malhar",
  GaudSarang = "Gaud Sarang",
  GorakhKalyan = "Gorakh Kalyan",
  GujariTodi = "Gujari Todi",
  Gunakri = "Gunakri",
  Hamir = "Hamir",
  Hansadhvani = "Hansadhvani",
  Hindol = "Hindol",
  Jaijaivanti = "Jaijaivanti",
  Jaunpuri = "Jaunpuri",
  Jhinjhoti = "Jhinjhoti",
  Jog = "Jog",
  Jogiya = "Jogiya",
  Kafi = "Kafi",
  Kamod = "Kamod",
  Kedar = "Kedar",
  Khamaj = "Khamaj",
  Kirvani = "Kirvani",
  Lalit = "Lalit",
  Madhuvanti = "Madhuvanti",
  Malkauns = "Malkauns",
  ManjKhamaj = "Manj Khamaj",
  MaruBihag = "Maru Bihag",
  Marva = "Marva",
  Megh = "Megh",
  MiyanKiMalhar = "Miyan Ki Malhar",
  MiyanKiTodi = "Miyan Ki Todi",
  Multani = "Multani",
  NayakiKanada = "Nayaki Kanada",
  Patdip = "Patdip",
  Pilu = "Pilu",
  Puriya = "Puriya",
  PuriyaDhanashri = "Puriya Dhanashri",
  PuriyaKalyan = "Puriya Kalyan",
  Purvi = "Purvi",
  Rageshri = "Rageshri",
  Ramkali = "Ramkali",
  Shahana = "Shahana",
  Shankara = "Shankara",
  Shivaranjani = "Shivaranjani",
  Shri = "Shri",
  ShuddhKalyan = "Shuddh Kalyan",
  ShuddhSarang = "Shuddh Sarang",
  ShyamKalyan = "Shyam Kalyan",
  Sindhura = "Sindhura",
  Sohini = "Sohini",
  SurMalhar = "Sur Malhar",
  TilakKamod = "Tilak Kamod",
  Tilang = "Tilang",
  Yaman = "Yaman",
  Custom = "Custom"
}

export enum Style {
  Classical = "Classical",
  WizardRock = "WizardRock",
  Devotional = "Devotional",
  Bollywood = "Bollywood"
}

export enum Mood {
  Peaceful = "Peaceful",
  Epic = "Epic",
  Romantic = "Romantic",
  Sad = "Sad",
  Energetic = "Energetic",
  Bhakti = "Bhakti"
}

export enum Swara {
  S = "S",
  r = "r",
  R = "R",
  g = "g",
  G = "G",
  m = "m",
  M = "M",
  P = "P",
  d = "d",
  D = "D",
  n = "n",
  N = "N"
}

export interface VocalTimelineEntry {
  time: number;
  midi: number;
  phoneme: string;
  emotion: string;
  duration: number;
}

export interface Composition {
  id: string;
  title: string;
  raga: Raga;
  style: Style;
  mood: Mood;
  bpm: number;
  melody: { midi: number; start: number; duration: number; velocity: number }[];
  bass: { midi: number; start: number; duration: number; velocity: number }[];
  drums: { midiNote: number; start: number; duration: number; velocity: number }[];
  vocalTimeline: VocalTimelineEntry[];
  lyrics: string;
  lyricsTranslation?: string;
  customScale?: number[];
  timestamp: number;
}

export interface VocalParams {
  vibrato: number;
  grit: number;
  ornamentation: "none" | "meend" | "gamak" | "taan";
  timbre: "kishore" | "rafi";
  gender: "male" | "female";
}

export interface VocalPreset {
  id: string;
  name: string;
  params: VocalParams;
}
