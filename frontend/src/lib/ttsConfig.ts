/**
 * Languages and voices the sandbox offers.
 *
 * Mirrors `backend/src/config/languages.js` — the backend is authoritative for
 * which Deepgram model each language runs on; this only needs to agree on the
 * codes and the default voice per language.
 *
 * Voices are Cartesia ids, passed through verbatim. The Indian ones are chosen
 * for register: a collection reminder needs calm and unhurried, not the upbeat
 * sales voice that reads as pressure when the subject is money someone owes.
 */

export interface LanguageOption {
  code: string;
  label: string;
  /** The language's own name, in its own script. */
  native: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'en-US', label: 'English', native: 'English' },
];

export interface VoiceOption {
  id: string;
  label: string;
  gender: 'Male' | 'Female';
  desc: string;
}

export const CARTESIA_VOICES: Record<string, VoiceOption[]> = {
  hi: [
    { id: '14008c51-fbf4-418e-ae23-9316a03dcfa2', label: 'Ishani', gender: 'Female', desc: 'Thoughtful, unhurried' },
    { id: '911d97fc-e9f5-4249-bf11-50d4edb7b8d8', label: 'Mehak', gender: 'Female', desc: 'Warm, good for rescheduling' },
    { id: 'cb9c954d-bcaa-43ed-82bf-aeb5e88a3cb5', label: 'Kabir', gender: 'Male', desc: 'Steady service voice' },
    { id: '00a472d9-32a2-4648-a733-f53e484a381e', label: 'Harsh', gender: 'Male', desc: 'Approachable' },
  ],
  ta: [
    { id: 'fb7d8d97-9730-4165-bd79-36b5ce61b5f2', label: 'Janani', gender: 'Female', desc: 'Calm professional' },
    { id: '4014f0c9-d3eb-4eca-af2b-fd6004f526be', label: 'Meena', gender: 'Female', desc: 'Measured' },
    { id: '19f28c21-ae34-499f-b64a-f7b09cd9b516', label: 'Karthik', gender: 'Male', desc: 'Customer assistant' },
  ],
  te: [
    { id: '4418bb06-8329-49a1-bb11-53bb64ca0547', label: 'Shanti', gender: 'Female', desc: 'Calm authority' },
    { id: '3a8e6fea-81e5-4d4d-8755-86093146cdb8', label: 'Vidya', gender: 'Female', desc: 'Empathetic' },
    { id: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b', label: 'Charan', gender: 'Male', desc: 'Clear' },
  ],
  mr: [
    { id: '5c32dce6-936a-4892-b131-bafe474afe5f', label: 'Anika', gender: 'Female', desc: 'Bright' },
    { id: 'f227bc18-3704-47fe-b759-8c78a450fdfa', label: 'Suresh', gender: 'Male', desc: 'Instructional' },
  ],
  bn: [
    { id: '48b9e1de-e2fa-4914-8b32-31c437813548', label: 'Ananya', gender: 'Female', desc: 'Paced, easy to follow' },
    { id: '59ba7dee-8f9a-432f-a6c0-ffb33666b654', label: 'Pooja', gender: 'Female', desc: 'Everyday' },
    { id: '2ba861ea-7cdc-43d1-8608-4045b5a41de5', label: 'Rubel', gender: 'Male', desc: 'Conversational' },
  ],
  'en-US': [
    { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'Kendra', gender: 'Female', desc: 'Smooth communicator' },
    { id: 'a7a59115-2425-4192-844c-1e98ec7d6877', label: 'Amber', gender: 'Female', desc: 'Warm support agent' },
    { id: '47c38ca4-5f35-497b-b1a3-415245fb35e1', label: 'Daniel', gender: 'Male', desc: 'Modern assistant' },
    { id: '820a3788-2b37-4d21-847a-b65d8a68c99a', label: 'Tyler', gender: 'Male', desc: 'Friendly' },
  ],
};

/** Hindi leads: the largest borrower base and the deepest voice roster. */
export const DEFAULT_LANGUAGE = 'hi';
export const DEFAULT_VOICE_ID = '14008c51-fbf4-418e-ae23-9316a03dcfa2';
export const TTS_PROVIDER = 'cartesia';

/** The default voice for a language, or the Hindi default if it is unknown. */
export const defaultVoiceFor = (language: string): string =>
  CARTESIA_VOICES[language]?.[0]?.id ?? DEFAULT_VOICE_ID;

/** Scripts that need the Devanagari serif rather than the Latin face. */
export const usesDevanagari = (language: string): boolean =>
  language === 'hi' || language === 'mr';
