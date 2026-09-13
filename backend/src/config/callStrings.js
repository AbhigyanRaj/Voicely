import { languageKey } from './languages.js';

/**
 * Everything the system itself says or shows during a call.
 *
 * These were eight hardcoded English strings scattered across the call path, two
 * of which were SPOKEN to the borrower: a Hindi conversation would be interrupted
 * by "Sorry, I didn't catch that. Could you say it again?" in English, and every
 * session ended with an English goodbye whatever language it had been conducted
 * in.
 *
 * Anything a borrower can hear, or an operator can see mid-call, belongs here.
 */
const STRINGS = {
  /**
   * Spoken when the model fails mid-turn. It has to be short -- it is synthesized
   * on an already-degraded path -- and it must never sound like an error message.
   */
  didNotCatch: {
    'en-US': "Sorry, I didn't catch that. Could you say it again?",
    hi: 'माफ़ कीजिए, मैं ठीक से सुन नहीं पाई। एक बार फिर बताइएगा?',
    mr: 'माफ करा, मला नीट ऐकू आलं नाही. पुन्हा सांगाल का?',
    ta: 'மன்னிக்கவும், சரியாக கேட்கவில்லை. மீண்டும் சொல்ல முடியுமா?',
    te: 'క్షమించండి, సరిగ్గా వినిపించలేదు. మళ్ళీ చెప్తారా?',
    bn: 'দুঃখিত, ঠিকমতো শুনতে পাইনি। আরেকবার বলবেন?',
  },

  /**
   * Spoken when the sandbox's time limit expires. The old English line -- "Kindly
   * log in to use further" -- was a product instruction delivered mid-conversation
   * to someone who believes they are talking to a lender. These close the call the
   * way a person would.
   */
  timeLimit: {
    'en-US': 'I have to go now, but thank you for your time. Goodbye.',
    hi: 'मुझे अब जाना होगा, आपका समय देने के लिए धन्यवाद। नमस्ते।',
    mr: 'मला आता जावं लागेल, तुमचा वेळ दिल्याबद्दल धन्यवाद. नमस्कार.',
    ta: 'நான் இப்போது கிளம்ப வேண்டும், உங்கள் நேரத்திற்கு நன்றி. வணக்கம்.',
    te: 'నేను ఇప్పుడు వెళ్ళాలి, మీ సమయానికి ధన్యవాదాలు. నమస్కారం.',
    bn: 'আমাকে এখন যেতে হবে, আপনার সময়ের জন্য ধন্যবাদ। নমস্কার।',
  },

  /** Opener for a custom agent that has not defined its own. */
  genericGreeting: {
    'en-US': 'Hello, I am calling about your account. Do you have a moment?',
    hi: 'नमस्ते, मैं आपके खाते के बारे में बात करने के लिए कॉल कर रही हूँ। क्या आपके पास एक मिनट है?',
    mr: 'नमस्कार, मी तुमच्या खात्याबद्दल बोलण्यासाठी फोन केला आहे. तुमच्याकडे एक मिनिट आहे का?',
    ta: 'வணக்கம், உங்கள் கணக்கு பற்றி பேச அழைக்கிறேன். ஒரு நிமிடம் இருக்கிறதா?',
    te: 'నమస్కారం, మీ ఖాతా గురించి మాట్లాడటానికి కాల్ చేస్తున్నాను. ఒక నిమిషం ఉందా?',
    bn: 'নমস্কার, আপনার অ্যাকাউন্ট নিয়ে কথা বলতে ফোন করেছি। এক মিনিট সময় হবে?',
  },

  // --- Shown on screen rather than spoken. The operator running the demo reads
  // --- these, but a lender watching over their shoulder reads them too.
  voiceUnavailable: {
    'en-US': "The voice service isn't responding, so you won't hear a reply. The transcript below still shows what the agent said.",
    hi: 'आवाज़ सेवा काम नहीं कर रही, इसलिए जवाब सुनाई नहीं देगा। नीचे ट्रांसक्रिप्ट में एजेंट की बात दिख रही है।',
    mr: 'आवाज सेवा काम करत नाही, त्यामुळे उत्तर ऐकू येणार नाही. खाली ट्रान्सक्रिप्टमध्ये एजंटचं बोलणं दिसतंय.',
    ta: 'குரல் சேவை இயங்கவில்லை, அதனால் பதில் கேட்காது. கீழே உள்ள உரையில் முகவர் சொன்னது தெரியும்.',
    te: 'వాయిస్ సేవ పనిచేయడం లేదు, కాబట్టి సమాధానం వినిపించదు. కింది ట్రాన్‌స్క్రిప్ట్‌లో ఏజెంట్ చెప్పింది కనిపిస్తుంది.',
    bn: 'ভয়েস পরিষেবা কাজ করছে না, তাই উত্তর শোনা যাবে না। নিচের ট্রান্সক্রিপ্টে এজেন্ট যা বলেছে তা দেখা যাচ্ছে।',
  },

  sessionNotFound: {
    'en-US': 'Could not find the session record. Please try again.',
    hi: 'सेशन का रिकॉर्ड नहीं मिला। कृपया दोबारा कोशिश करें।',
    mr: 'सेशनचा रेकॉर्ड सापडला नाही. कृपया पुन्हा प्रयत्न करा.',
    ta: 'அமர்வுப் பதிவு கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.',
    te: 'సెషన్ రికార్డు దొరకలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.',
    bn: 'সেশনের রেকর্ড পাওয়া যায়নি। আবার চেষ্টা করুন।',
  },

  pipelineFailed: {
    'en-US': 'The voice pipeline failed to start. Please try again.',
    hi: 'वॉइस पाइपलाइन शुरू नहीं हो पाई। कृपया दोबारा कोशिश करें।',
    mr: 'व्हॉइस पाइपलाइन सुरू होऊ शकली नाही. कृपया पुन्हा प्रयत्न करा.',
    ta: 'குரல் அமைப்பு தொடங்கவில்லை. மீண்டும் முயற்சிக்கவும்.',
    te: 'వాయిస్ పైప్‌లైన్ ప్రారంభం కాలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.',
    bn: 'ভয়েস পাইপলাইন চালু হয়নি। আবার চেষ্টা করুন।',
  },
};

/**
 * One string in one language.
 *
 * Falls back to English rather than throwing or returning the key: a missing
 * translation should produce an odd-sounding call, not a broken one.
 *
 * @param {keyof STRINGS} key
 * @param {string} language  any code `languageKey` understands
 */
export function t(key, language) {
  const table = STRINGS[key];
  if (!table) {
    // A typo'd key would otherwise be spoken aloud as its own name.
    throw new Error(`Unknown call string: ${key}`);
  }
  return table[languageKey(language)] || table['en-US'];
}

export { STRINGS };
export default { t, STRINGS };
