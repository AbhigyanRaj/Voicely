/**
 * Voice catalogue.
 *
 * The stack is Deepgram STT + Groq LLM + Cartesia TTS, English only. The Sarvam,
 * Google and Deepgram-Aura tables that used to live here described providers the
 * product no longer speaks to -- two of them had no working credentials, and the
 * Sarvam entries named bulbul:v2 speakers that the current API rejects outright.
 */

export const CARTESIA_LANGUAGES = [
  { code: 'en-US', label: 'English' }
];

export interface VoiceOption {
  id: string;
  label: string;
  gender: string;
  desc?: string;
}

export const CARTESIA_VOICES: Record<string, VoiceOption[]> = {
  'en-US': [
    { id: '47c38ca4-5f35-497b-b1a3-415245fb35e1', label: 'Daniel', gender: 'Male', desc: 'Modern Assistant' },
    { id: '820a3788-2b37-4d21-847a-b65d8a68c99a', label: 'Tyler', gender: 'Male', desc: 'Friendly Salesman' },
    { id: 'a7a59115-2425-4192-844c-1e98ec7d6877', label: 'Amber', gender: 'Female', desc: 'Warm Support Agent' },
    { id: 'f9fc912e-52f0-448a-8bfa-47e9ca75f25a', label: 'Marilyn', gender: 'Female', desc: 'Explainer' },
    { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'Kendra', gender: 'Female', desc: 'Smooth Communicator' }
  ]
};

/** The voice a session uses when nothing else is specified. */
export const DEFAULT_VOICE_ID = '79a125e8-cd45-4c13-8a67-188112f4dd22';
export const DEFAULT_LANGUAGE = 'en-US';
export const TTS_PROVIDER = 'cartesia';
