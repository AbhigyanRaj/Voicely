export const CARTESIA_LANGUAGES = [
  { code: 'en-US', label: 'English (Cartesia)' }
];

export const CARTESIA_VOICES: Record<string, { id: string; label: string; gender: string; desc?: string }[]> = {
  'en-US': [
    { id: '47c38ca4-5f35-497b-b1a3-415245fb35e1', label: 'Daniel', gender: 'Male', desc: 'Modern Assistant' },
    { id: '820a3788-2b37-4d21-847a-b65d8a68c99a', label: 'Tyler', gender: 'Male', desc: 'Friendly Salesman' },
    { id: 'a7a59115-2425-4192-844c-1e98ec7d6877', label: 'Amber', gender: 'Female', desc: 'Warm Support Agent' },
    { id: 'f9fc912e-52f0-448a-8bfa-47e9ca75f25a', label: 'Marilyn', gender: 'Female', desc: 'Explainer' },
    { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'Kendra', gender: 'Female', desc: 'Smooth Communicator' }
  ]
};

// Keeping Google/Deepgram exports so we don't break other files implicitly, but they won't be used in the Sandbox UI.
export const GOOGLE_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' }
];

export const GOOGLE_VOICES: Record<string, { id: string; label: string; gender: string; demo?: string; desc?: string }[]> = {
  'en-IN': [
    { id: 'NEERJA', label: 'Neerja', gender: 'Female', demo: '/audio/voice-samples/neerja_neerja.mp3', desc: 'Premium (Female)' },
    { id: 'PRABHAT', label: 'Prabhat', gender: 'Male', demo: '/audio/voice-samples/prabhat_prabhat.mp3', desc: 'Premium (Male)' },
    { id: 'DIVYA', label: 'Divya', gender: 'Female', demo: '/audio/voice-samples/divya_divya.mp3', desc: 'Alt (Female)' },
    { id: 'KAVYA', label: 'Kavya', gender: 'Male', demo: '/audio/voice-samples/kavya_kavya.mp3', desc: 'Alt (Male)' }
  ],
  'hi-IN': [
    { id: 'NEERJA_HI', label: 'Aditi (Hindi)', gender: 'Female', demo: '/audio/voice-samples/neerja_hi_aditi.mp3', desc: 'Premium (Female)' },
    { id: 'PRABHAT_HI', label: 'Pankaj (Hindi)', gender: 'Male', demo: '/audio/voice-samples/prabhat_hi_pankaj.mp3', desc: 'Premium (Male)' },
    { id: 'DIVYA_HI', label: 'Divya (Hindi)', gender: 'Female', demo: '/audio/voice-samples/divya_hi_divya.mp3', desc: 'Alt (Female)' },
    { id: 'KAVYA_HI', label: 'Kavya (Hindi)', gender: 'Male', demo: '/audio/voice-samples/kavya_hi_kavya.mp3', desc: 'Alt (Male)' }
  ]
};

export const SARVAM_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' }
];

export const SARVAM_VOICES: Record<string, { id: string; label: string; gender: string; demo?: string; desc?: string }[]> = {
  'en-IN': [{ id: 'arya', label: 'Arya', gender: 'Female', desc: 'English Speaker' }, { id: 'karun', label: 'Karun', gender: 'Male', desc: 'English Speaker' }],
  'hi-IN': [{ id: 'anushka', label: 'Anushka', gender: 'Female', desc: 'Hindi Speaker' }, { id: 'abhilash', label: 'Abhilash', gender: 'Male', desc: 'Hindi Speaker' }]
};

export const DEEPGRAM_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' }
];

export const DEEPGRAM_VOICES: Record<string, { id: string; label: string; gender: string; desc?: string }[]> = {
  'en-US': [
    { id: 'aura-asteria-en', label: 'Asteria (US)', gender: 'Female', desc: 'Fluent & Conversational' },
    { id: 'aura-luna-en', label: 'Luna (US)', gender: 'Female', desc: 'Fluent & Professional' },
    { id: 'aura-orpheus-en', label: 'Orpheus (US)', gender: 'Male', desc: 'Fluent & Professional' },
    { id: 'aura-zeus-en', label: 'Zeus (US)', gender: 'Male', desc: 'Fluent & Conversational' }
  ]
};
