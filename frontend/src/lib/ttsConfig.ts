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
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'gu-IN', label: 'Gujarati' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'or-IN', label: 'Oriya' },
  { code: 'pa-IN', label: 'Punjabi' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' }
];

export const SARVAM_VOICES: Record<string, { id: string; label: string; gender: string; demo?: string; desc?: string }[]> = {
  'en-IN': [{ id: 'arya', label: 'Arya', gender: 'Female', desc: 'English Speaker' }, { id: 'karun', label: 'Karun', gender: 'Male', desc: 'English Speaker' }],
  'hi-IN': [{ id: 'anushka', label: 'Anushka', gender: 'Female', desc: 'Hindi Speaker' }, { id: 'abhilash', label: 'Abhilash', gender: 'Male', desc: 'Hindi Speaker' }],
  'bn-IN': [{ id: 'manisha', label: 'Manisha', gender: 'Female', desc: 'Bengali Speaker' }, { id: 'hitesh', label: 'Hitesh', gender: 'Male', desc: 'Bengali Speaker' }],
  'gu-IN': [{ id: 'vidya', label: 'Vidya', gender: 'Female', desc: 'Gujarati Speaker' }, { id: 'karun', label: 'Karun', gender: 'Male', desc: 'Gujarati Speaker' }],
  'kn-IN': [{ id: 'arya', label: 'Arya', gender: 'Female', desc: 'Kannada Speaker' }, { id: 'abhilash', label: 'Abhilash', gender: 'Male', desc: 'Kannada Speaker' }],
  'ml-IN': [{ id: 'anushka', label: 'Anushka', gender: 'Female', desc: 'Malayalam Speaker' }, { id: 'hitesh', label: 'Hitesh', gender: 'Male', desc: 'Malayalam Speaker' }],
  'mr-IN': [{ id: 'manisha', label: 'Manisha', gender: 'Female', desc: 'Marathi Speaker' }, { id: 'karun', label: 'Karun', gender: 'Male', desc: 'Marathi Speaker' }],
  'or-IN': [{ id: 'vidya', label: 'Vidya', gender: 'Female', desc: 'Oriya Speaker' }, { id: 'abhilash', label: 'Abhilash', gender: 'Male', desc: 'Oriya Speaker' }],
  'pa-IN': [{ id: 'arya', label: 'Arya', gender: 'Female', desc: 'Punjabi Speaker' }, { id: 'karun', label: 'Karun', gender: 'Male', desc: 'Punjabi Speaker' }],
  'ta-IN': [{ id: 'anushka', label: 'Anushka', gender: 'Female', desc: 'Tamil Speaker' }, { id: 'hitesh', label: 'Hitesh', gender: 'Male', desc: 'Tamil Speaker' }],
  'te-IN': [{ id: 'manisha', label: 'Manisha', gender: 'Female', desc: 'Telugu Speaker' }, { id: 'abhilash', label: 'Abhilash', gender: 'Male', desc: 'Telugu Speaker' }]
};
