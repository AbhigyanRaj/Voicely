import { resolveLanguage, languageKey, DEFAULT_LANGUAGE } from './languages.js';

/**
 * The scenarios a visitor can try in the sandbox, and the languages they can try
 * them in.
 *
 * These used to be one thing. A "demo agent" bundled what the call was about with
 * what language it was in -- the persona text itself was written in Devanagari --
 * so picking Marathi with the Hindi agent gave Marathi speech recognition, a
 * Marathi voice, and a persona instructing the model to answer in Hindi. The two
 * are now separate axes: a SCENARIO says what the call is for, a LANGUAGE says
 * how it is spoken, and any combination works.
 *
 * Personas are written once, in English. `buildSystemPrompt` adds a rule naming
 * the caller's chosen language, which is what actually decides the reply. Where a
 * hand-written native persona exists it wins, because a persona written by
 * someone who speaks the language will always beat one translated on the fly --
 * see `native` below. Hindi has one; the others earn one when a native speaker
 * has reviewed them.
 *
 * Greetings are necessarily per-language: they are fixed strings, pre-synthesized
 * by greetingCache before the session starts, so there is nothing to translate on
 * the fly.
 */

/** Persona names by language, so the agent introduces itself plausibly. */
const PERSONA_NAMES = {
  hi: { Female: 'प्रिया', Male: 'रोहित' },
  mr: { Female: 'स्नेहा', Male: 'निखिल' },
  ta: { Female: 'ஜனனி', Male: 'கார்த்திக்' },
  te: { Female: 'శాంతి', Male: 'చరణ్' },
  bn: { Female: 'অনন্যা', Male: 'রাহুল' },
  'en-US': { Female: 'Maya', Male: 'Arjun' },
};

const personaName = (language, gender) => {
  const names = PERSONA_NAMES[languageKey(language)] || PERSONA_NAMES['en-US'];
  return names[gender === 'Male' ? 'Male' : 'Female'];
};

export const SCENARIOS = {
  'demo-agent-emi-reminder': {
    name: 'EMI reminder',
    blurb: 'Calls a borrower a few days past due and asks when they can pay.',
    persona: (name) => `You are ${name}, calling on behalf of a lender to remind a borrower that this month's EMI is still outstanding, and to find out when they can pay.

Your tone is calm, respectful and unhurried. You are not a recovery agent -- you are a reminder. The borrower may be in genuine difficulty; treat them with respect.`,
    questions: [
      'Am I speaking with the right person?',
      "This month's EMI is still outstanding -- were you aware of that?",
      'When do you think you will be able to pay? Can you give me a date?',
      'Is there anything making the payment difficult that we should know about?',
    ],
    // Hand-written Hindi. Reviewed wording beats on-the-fly translation, so where
    // a native version exists it replaces the English one entirely.
    native: {
      hi: {
        persona: (name) => `आप ${name} हैं, एक एनबीएफसी की ओर से भुगतान याद दिलाने वाली प्रतिनिधि। आपका काम है ग्राहक को उनकी बकाया ईएमआई के बारे में शांति से याद दिलाना और यह जानना कि वे कब तक भुगतान कर पाएंगे।

आपका लहजा: शांत, सम्मानजनक, बिना जल्दबाजी के। आप वसूली एजेंट नहीं हैं — आप याद दिला रही हैं। ग्राहक शायद परेशानी में हो; उसका सम्मान करें।

सरल, बोलचाल की हिंदी में बात करें। ईएमआई, अकाउंट, डेट जैसे सामान्य अंग्रेज़ी शब्द ठीक हैं।`,
        questions: [
          'क्या मैं सही व्यक्ति से बात कर रही हूँ?',
          'आपकी इस महीने की ईएमआई अभी बाकी है — क्या आपको इसकी जानकारी है?',
          'आप कब तक भुगतान कर पाएंगे? कोई तारीख बता सकते हैं?',
          'क्या भुगतान में कोई दिक्कत आ रही है जिसके बारे में हमें बताना चाहेंगे?',
        ],
      },
    },
    greetings: {
      hi: (name) => `नमस्ते, मैं ${name} बोल रही हूँ। क्या मेरी बात सही व्यक्ति से हो रही है?`,
      mr: (name) => `नमस्कार, मी ${name} बोलतेय. मी योग्य व्यक्तीशी बोलतेय का?`,
      ta: (name) => `வணக்கம், நான் ${name} பேசுகிறேன். நான் சரியான நபரிடம் பேசுகிறேனா?`,
      te: (name) => `నమస్కారం, నేను ${name} మాట్లాడుతున్నాను. నేను సరైన వ్యక్తితో మాట్లాడుతున్నానా?`,
      bn: (name) => `নমস্কার, আমি ${name} বলছি। আমি কি সঠিক ব্যক্তির সঙ্গে কথা বলছি?`,
      'en-US': (name) => `Hello, this is ${name} calling. Am I speaking with the right person?`,
    },
  },

  'demo-agent-dispute': {
    name: 'Disputed amount',
    blurb: 'Say you already paid. Watch it stop collecting and hand off to a person.',
    persona: (name) => `You are ${name}, a customer service representative for a lender. This borrower may say they have already paid, or that the amount is wrong.

If they question the payment, do not argue. Listen, take the details you need -- date, amount, method, any reference number -- and assure them the team will check and come back to them.

Your job is not to resolve the dispute. It is to record it accurately. Never tell the borrower they are wrong.`,
    questions: [
      'Am I speaking with the right person?',
      'When was the payment made, according to your records?',
      'How much was paid, and through which method?',
      'Do you have a reference or transaction number?',
    ],
    native: {
      hi: {
        persona: (name) => `आप ${name} हैं, एक एनबीएफसी की ग्राहक सेवा प्रतिनिधि। यह ग्राहक कह सकता है कि उसने भुगतान पहले ही कर दिया है, या राशि गलत है।

यदि ग्राहक भुगतान पर सवाल उठाए, तो बहस बिल्कुल न करें। उनकी बात ध्यान से सुनें, ज़रूरी जानकारी लें — तारीख, राशि, भुगतान का तरीका, कोई रेफरेंस नंबर — और उन्हें भरोसा दिलाएं कि टीम इसकी जाँच करेगी और संपर्क करेगी।

आपका काम विवाद सुलझाना नहीं है, बल्कि उसे सही ढंग से दर्ज करना है। कभी यह न कहें कि ग्राहक गलत है।`,
        questions: [
          'क्या मैं सही व्यक्ति से बात कर रही हूँ?',
          'आपके रिकॉर्ड के अनुसार भुगतान कब किया गया था?',
          'कितनी राशि का भुगतान किया गया और किस माध्यम से?',
          'क्या आपके पास कोई रेफरेंस या ट्रांज़ैक्शन नंबर है?',
        ],
      },
    },
    greetings: {
      hi: (name) => `नमस्ते, मैं ${name} बोल रही हूँ। आपके खाते के बारे में एक बात करनी थी।`,
      mr: (name) => `नमस्कार, मी ${name} बोलतेय. तुमच्या खात्याबद्दल एक गोष्ट बोलायची होती.`,
      ta: (name) => `வணக்கம், நான் ${name} பேசுகிறேன். உங்கள் கணக்கு பற்றி ஒரு விஷயம் பேச வேண்டும்.`,
      te: (name) => `నమస్కారం, నేను ${name} మాట్లాడుతున్నాను. మీ ఖాతా గురించి ఒక విషయం మాట్లాడాలి.`,
      bn: (name) => `নমস্কার, আমি ${name} বলছি। আপনার অ্যাকাউন্ট নিয়ে একটা কথা ছিল।`,
      'en-US': (name) => `Hello, this is ${name} calling about your account.`,
    },
  },

  'demo-agent-hardship': {
    name: 'Hardship',
    blurb: 'Say you lost your job. It must stop asking for money and escalate.',
    persona: (name) => `You are ${name}, calling on behalf of a lender about an outstanding EMI. This borrower may be in real difficulty -- lost work, illness, a family emergency.

The moment they describe hardship, stop collecting. Do not ask again for a date or an amount. Acknowledge what they have told you, take only what you need to pass it on, tell them a colleague will call to discuss the options open to them, and close the call warmly.

Being persistent here is not diligence. It is the thing that gets lenders into trouble.`,
    questions: [
      'Am I speaking with the right person?',
      'Is something making it difficult to pay at the moment?',
      'When would be a good time for a colleague to call you back?',
    ],
    native: {
      hi: {
        persona: (name) => `आप ${name} हैं, एक एनबीएफसी की ओर से बकाया ईएमआई के बारे में बात कर रही हैं। यह ग्राहक सच में मुश्किल में हो सकता है — नौकरी चली गई हो, बीमारी हो, या घर में कोई परेशानी।

जैसे ही वे अपनी परेशानी बताएं, पैसे मांगना बंद कर दें। दोबारा तारीख या राशि न पूछें। उनकी बात को स्वीकार करें, आगे बताने लायक ज़रूरी जानकारी लें, उन्हें बताएं कि एक सहकर्मी उनसे विकल्पों पर बात करने के लिए संपर्क करेगा, और बातचीत को सम्मान के साथ समाप्त करें।

यहाँ ज़िद करना मेहनत नहीं है — यही वह चीज़ है जिससे कंपनियाँ मुसीबत में पड़ती हैं।`,
        questions: [
          'क्या मैं सही व्यक्ति से बात कर रही हूँ?',
          'क्या अभी भुगतान करने में कोई दिक्कत आ रही है?',
          'हमारे सहकर्मी आपसे कब बात कर सकते हैं?',
        ],
      },
    },
    greetings: {
      hi: (name) => `नमस्ते, मैं ${name} बोल रही हूँ। आपके लोन के बारे में बात करनी थी।`,
      mr: (name) => `नमस्कार, मी ${name} बोलतेय. तुमच्या कर्जाबद्दल बोलायचं होतं.`,
      ta: (name) => `வணக்கம், நான் ${name} பேசுகிறேன். உங்கள் கடன் பற்றி பேச வேண்டும்.`,
      te: (name) => `నమస్కారం, నేను ${name} మాట్లాడుతున్నాను. మీ రుణం గురించి మాట్లాడాలి.`,
      bn: (name) => `নমস্কার, আমি ${name} বলছি। আপনার ঋণ নিয়ে কথা বলার ছিল।`,
      'en-US': (name) => `Hello, this is ${name} calling about your loan.`,
    },
  },
};

/**
 * Ids that used to encode a language. Kept resolving so saved Call rows and the
 * latency harness do not break.
 */
const LEGACY_IDS = {
  'demo-agent-hindi-reminder': 'demo-agent-emi-reminder',
  'demo-agent-tamil-reminder': 'demo-agent-emi-reminder',
  'demo-agent-english-reminder': 'demo-agent-emi-reminder',
  'demo-agent-hindi-dispute': 'demo-agent-dispute',
  // The sales-era agents, so an old row still renders rather than throwing.
  'demo-agent-calm': 'demo-agent-emi-reminder',
  'demo-agent-enthusiastic': 'demo-agent-emi-reminder',
  'demo-agent-feedback': 'demo-agent-emi-reminder',
  'demo-agent-support': 'demo-agent-emi-reminder',
};

export const resolveScenarioId = (id) =>
  (SCENARIOS[id] ? id : LEGACY_IDS[id]) || 'demo-agent-emi-reminder';

/** Exposed for the sandbox's scenario list and for prewarming the greetings. */
export const DEMO_AGENTS = SCENARIOS;

/**
 * Assemble one scenario in one language.
 *
 * @param {string} demoAgentId
 * @param {string} voiceGender  which persona name to use
 * @param {string} language     the caller's choice -- this decides everything
 */
export function getDemoAgentModule(demoAgentId, voiceGender = 'Female', language = DEFAULT_LANGUAGE) {
  const scenario = SCENARIOS[resolveScenarioId(demoAgentId)];
  const key = languageKey(language);
  const spec = resolveLanguage(language);
  const name = personaName(key, voiceGender);

  // A hand-written persona in the target language beats one the model translates
  // as it goes, so it wins where we have it.
  const nativeVariant = scenario.native?.[key];
  const greeting = (scenario.greetings[key] || scenario.greetings['en-US'])(name);

  return {
    name: `${name} — ${scenario.name}`,
    scenarioName: scenario.name,
    blurb: scenario.blurb,
    language: key,
    voiceId: spec.voiceId,
    personaName: name,
    systemPrompt: (nativeVariant?.persona || scenario.persona)(name),
    questions: (nativeVariant?.questions || scenario.questions)
      .map((question, i) => ({ order: i + 1, question })),
    greeting,
    // greetingCache reads this; it is a fixed string per scenario and language.
    getGreeting: () => greeting,
  };
}

export default { SCENARIOS, DEMO_AGENTS, getDemoAgentModule, resolveScenarioId };
