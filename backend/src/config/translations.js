// Translations for multilingual support
export const TRANSLATIONS = {
  english: {
    greeting: {
      default: "Hello {name}, this is an automated call from {company}. How are you doing today?",
      simple: "Hello {name}, thank you for your time today."
    },
    confirmation: {
      proceed: "Great! Let me ask you a few questions. This will only take a few minutes. Shall we proceed?",
      ready: "Are you ready to continue?"
    },
    decline: {
      message: "No problem! We understand. Thank you for your time. Have a great day!",
      callback: "Would you like us to call you back at a better time?"
    },
    noResponse: {
      message: "I didn't catch that. Could you please repeat?",
      retry: "I'm sorry, I couldn't hear you clearly. Let me try again."
    },
    retryPrompt: {
      message: "I didn't quite get that. Could you please say that again?",
      final: "I'm having trouble understanding. Let me move to the next question."
    },
    outro: {
      default: "Thank you so much for your time, {name}. We really appreciate your responses. Have a wonderful day!",
      simple: "Thank you for your time. Goodbye!"
    },
    final: {
      message: "This concludes our call. Thank you and goodbye!",
      appreciation: "We appreciate your participation. Take care!"
    },
    errors: {
      technical: "We're experiencing technical difficulties. We'll call you back shortly.",
      timeout: "I'm sorry, we seem to have lost connection. We'll try again later."
    }
  },
  hindi: {
    greeting: {
      default: " {name},  {company}          ?",
      simple: " {name},     "
    },
    confirmation: {
      proceed: " !               ?",
      ready: "       ?"
    },
    decline: {
      message: "  !            !",
      callback: "           ?"
    },
    noResponse: {
      message: "         ?",
      retry: " ,              "
    },
    retryPrompt: {
      message: "              ?",
      final: "            "
    },
    outro: {
      default: "    - , {name}           !",
      simple: "     !"
    },
    final: {
      message: "        !",
      appreciation: "        !"
    },
    errors: {
      technical: "               ",
      timeout: " ,              "
    }
  }
};

/**
 * Get translated text based on language
 * @param {string} language - 'english' or 'hindi'
 * @param {string} category - Category of text (greeting, confirmation, etc.)
 * @param {string} key - Specific key within category
 * @param {object} replacements - Object with values to replace in template
 * @returns {string} Translated text
 */
export function getTranslation(language = 'english', category, key = 'default', replacements = {}) {
  const lang = language.toLowerCase();
  const translations = TRANSLATIONS[lang] || TRANSLATIONS.english;

  let text = translations[category]?.[key] || translations[category]?.default || '';

  // Replace placeholders like {name}, {company}
  Object.keys(replacements).forEach(placeholder => {
    text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), replacements[placeholder]);
  });

  return text;
}

/**
 * Get voice ID based on language and base voice
 * @param {string} baseVoice - Base voice like 'NEERJA', 'PRABHAT'
 * @param {string} language - 'english' or 'hindi'
 * @returns {string} Voice ID with language suffix if needed
 */
export function getVoiceForLanguage(baseVoice, language = 'english') {
  // Ensure baseVoice is uppercase for consistency
  const normalizedVoice = baseVoice.toUpperCase();

  if (language.toLowerCase() === 'hindi') {
    // Append _HI suffix for Hindi voices if not already present
    const hindiVoice = normalizedVoice.includes('_HI') ? normalizedVoice : `${normalizedVoice}_HI`;
    logger.debug(`Voice language mapping for ${baseVoice}: Hindi -> ${hindiVoice}`);
    return hindiVoice;
  }

  const englishVoice = VOICE_LANG_MAP[baseVoice]?.english || baseVoice;
  logger.debug(`Voice language mapping for ${baseVoice}: English -> ${englishVoice}`);
  return englishVoice;
}
