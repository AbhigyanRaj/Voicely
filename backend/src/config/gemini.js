import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Note: We use the default configuration which usually targets v1 or v1beta.
// If v1beta is failing with 404, we can try to force v1 in the model options.

export const generateConversationalResponseStream = async (systemPrompt, chatHistory, onChunk) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const prompt = `${systemPrompt}\n\n--- Conversation History ---\n${chatHistory}\nAI:`;

    const result = await model.generateContentStream(prompt);
    let fullText = '';

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      if (onChunk) onChunk(chunkText);
    }

    logger.debug(`Gemini Response Complete: [Length: ${fullText.length}]`);
    return fullText.trim();
  } catch (error) {
    logger.error('Gemini conversational stream error', error);
    if (error.response) {
        logger.error('Gemini error response data', error.response);
    }
    throw error;
  }
};

export const transcribeAudio = async (audioBuffer) => {
  try {
    // Note: Actual transcription happens during the call via Twilio's speech recognition
    // The transcription is built from the SpeechResult responses collected during the call
    // This function is kept for compatibility but transcription is handled in real-time
    logger.debug('Gemini configuration: Transcription mode active');
    return "Transcription is captured in real-time during the call via Twilio speech recognition";
  } catch (error) {
    logger.error('Transcription error', error);
    throw error;
  }
};

export const generateSummary = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const prompt = `You are a helpful assistant that summarizes call transcripts and extracts key insights. Please summarize this call transcript and extract key insights: ${text}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    logger.error('Summary generation error', error);
    throw error;
  }
};

/**
 * Extract structured answers from transcript
 */
export const extractAnswersJSON = async (chatHistory, questions) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

    const prompt = `You are a data extraction assistant. Based on this phone call transcript, extract the user's answers to the following questions.
    
    --- TRANSCRIPT ---
    ${chatHistory}
    
    --- QUESTIONS ---
    ${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
    
    Return a strictly valid JSON object where the keys are the exact questions as strings, and the values are the user's extracted answers. If a question was not answered or wasn't reached, set the value to "Not answered". Do NOT include Markdown blocks like \`\`\`json. Return only the raw JSON string.`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();

    // Strip markdown formatting if Gemini included it despite instructions
    responseText = responseText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    return JSON.parse(responseText);
  } catch (error) {
    logger.error('Data extraction error (JSON parsing or API issue)', error);
    return {};
  }
};

/**
 * Evaluate loan application based on responses
 * Based on the reference Python implementation
 */
export const evaluateLoanApplication = async (applicationData) => {
  const prompt = `
Loan Application Evaluation for Indian Market:
Applicant Profile: ${JSON.stringify(applicationData, null, 2)}

Decisioning Criteria:
1. Age: >=18 years
2. Minimum monthly income: 25,000
3. CIBIL Score: Above 600
4. Loan-to-income ratio: Max 4x annual income

Based on the above criteria, respond with exactly one of these three options:
YES (if application meets all criteria)
NO (if application clearly fails criteria)
INVESTIGATION_REQUIRED (if more information needed)

You are a loan decisioning expert. Respond only with YES, NO, or INVESTIGATION_REQUIRED.
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    logger.error('Loan evaluation error', error);
    return "INVESTIGATION_REQUIRED";
  }
};

/**
 * Analyze customer response using Gemini AI
 */
export const evaluateCreditCardApplication = async (applicationData) => {
  const prompt = `
Credit Card Application Evaluation for Indian Market:
Applicant Profile: ${JSON.stringify(applicationData, null, 2)}

Decisioning Criteria:
1. Age: 18-60 years range
2. Minimum annual income: 3,00,000
3. CIBIL Score: Above 700
4. No recent payment defaults
5. Stable employment

Based on the above criteria, respond with exactly one of these three options:
YES (if application meets all criteria)
NO (if application clearly fails criteria)
INVESTIGATION_REQUIRED (if more information needed)

You are a credit card decisioning expert. Respond only with YES, NO, or INVESTIGATION_REQUIRED.
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    logger.error('Credit card evaluation error', error);
    return "INVESTIGATION_REQUIRED";
  }
};

/**
 * Analyze customer response using Gemini AI
 */
export const analyzeResponseWithGemini = async (prompt) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    logger.error('Gemini analysis error', error);
    throw error;
  }
};

/**
 * Generate predefined questions for loan applications
 */
export const generateLoanQuestions = () => {
  return [
    "What is your current age?",
    "What is your monthly income in Indian Rupees?",
    "Are you a salaried employee, self-employed, or a business owner?",
    "In which city and state do you currently reside?",
    "What is your current occupation and industry?",
    "How much loan amount are you seeking in Indian Rupees?",
    "Do you have a CIBIL credit score?",
    "Are you a first-time loan applicant?",
    "Do you have any existing EMIs or loan commitments?",
    "What is the primary purpose of this loan?"
  ];
};

/**
 * Generate predefined questions for credit card applications
 */
export const generateCreditCardQuestions = () => {
  return [
    "What is your current age?",
    "What is your annual income in Indian Rupees?",
    "Are you employed in private sector, government, or self-employed?",
    "In which city do you currently work?",
    "Do you have any existing credit cards?",
    "What is your CIBIL credit score?",
    "Have you ever defaulted on any credit or loan payment?",
    "What is your typical monthly household expenditure?",
    "Do you have any existing loan EMIs?",
    "Are you a first-time credit card applicant?"
  ];
};

/**
 * Perform Industry-Grade Deep Analysis on call transcript
 */
export const performDeepAnalysis = async (chatHistory, agentType, customerName, agentGoal, questions) => {
  const prompt = `
You are an expert sales psychologist and business analyst. Analyze this phone call between an AI Agent and a customer named ${customerName}.

AGENT CONTEXT:
Type: ${agentType}
Business Goal: ${agentGoal}

TRANSCRIPT:
${chatHistory}

QUESTIONS AGENT WAS SUPPOSED TO ASK:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Based on the above, provide a deep qualitative analysis in strictly valid JSON format:
{
  "sentiment": "Enthusiastic" | "Hesitant" | "Annoyed" | "Confused" | "Neutral",
  "objections": ["subset of: Price, Timing, Trust, Need, Authority, Competition"],
  "intentTier": "High" | "Medium" | "Low",
  "extractedData": { "key": "value pairs for specific data points found in transcript like budget, city, name, etc." },
  "competitorMentioned": true | false,
  "summary": "A concise 2-sentence professional summary for the business owner",
  "stageAnalysis": {
    "questionsReached": total_number_of_questions_completed,
    "dropOffPoint": "The exact question where user hangup or conversation stalled"
  },
  "followupInfo": {
    "shouldFollowUp": true | false,
    "scheduledTime": "Relative time like 'in 5 minutes' or 'tomorrow at 2pm' or null",
    "reason": "Short reason for follow up"
  }
}

Rules:
1. Be objective, not optimistic.
2. If the user was rude or hung up immediately, set sentiment to Annoyed.
3. intentTier should be HIGH if they scheduled a site visit, meeting, purchase or said YES clearly to the primary goal. MEDIUM if they had many questions but no commitment. LOW if they were just scouting or disinterested.
4. Objections MUST only use the words: Price, Timing, Trust, Need, Authority, Competition. If they mention money, it's 'Price'. If they are busy, it's 'Timing'.
5. Return ONLY raw JSON string. No markdown code blocks.
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    // Safety: Strip markdown
    responseText = responseText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    
    return JSON.parse(responseText);
  } catch (error) {
    logger.error('Deep analysis error', error);
    return {
      sentiment: 'Neutral',
      objections: [],
      intentTier: 'Medium',
      extractedData: {},
      competitorMentioned: false,
      summary: 'Analysis failed due to technical error.',
      stageAnalysis: { questionsReached: 0, dropOffPoint: null }
    };
  }
};

/**
 * Specialized evaluations for different industry categories
 */

const evaluateRealEstateCall = async (data, transcript = "") => {
  const prompt = `
  Analyze this Real Estate lead profile: ${JSON.stringify(data, null, 2)}
  Context Transcript: ${transcript.substring(transcript.length - 1000)}

  Evaluate if the lead is a fit for a property viewing.
  Criteria:
  1. Have they specified an interest in property?
  2. Have they agreed to a follow-up or site visit?

  Provide decision: 
  YES (If they agreed to site visit or confirmed high intent)
  INTERESTED (If they asked questions but didn't confirm visit yet)
  NO (Invalid number, wrong person, or clearly not interested)

  Return ONLY the status string.
  `;
  return await analyzeResponseWithGemini(prompt);
};

const evaluateMedicalCall = async (data) => {
  const prompt = `
  Analyze this Medical Patient inquiry: ${JSON.stringify(data, null, 2)}
  Identify: Urgency, Specific symptoms mentioned, and Appointment availability.
  Provide decision: URGENT (Needs immediate callback), BOOKED (Appointment set), GENERAL_INQUIRY.
  Return ONLY the status.
  `;
  return await analyzeResponseWithGemini(prompt);
};

const evaluateEcomCall = async (data) => {
  const prompt = `
  Analyze this E-commerce customer interaction: ${JSON.stringify(data, null, 2)}
  Identify: Purchase intent, Product interest, or Feedback.
  Provide decision: PURCHASED, ABANDONED_CART (High intent but no buy), FEEDBACK_RECEIVED.
  Return ONLY the status.
  `;
  return await analyzeResponseWithGemini(prompt);
};

const evaluateSalesCall = async (data) => {
  const prompt = `
  Analyze this B2B/Startup Sales lead: ${JSON.stringify(data, null, 2)}
  Use BANT (Budget, Authority, Need, Timeline) framework.
  Provide decision: QUALIFIED (High intent), NURTURE (Needs more info), UNQUALIFIED.
  Return ONLY the status.
  `;
  return await analyzeResponseWithGemini(prompt);
};

/**
 * Evaluate application based on type and category
 */
export const evaluateApplication = async (applicationType, applicationData, category = 'startup', transcript = "") => {
  // Handle Custom or Industry-specific modules
  if (!applicationType || applicationType === 'custom') {
    // Legacy: We used to check for numeric question indices. 
    // Now we use semantic keys from extractedData, so we can proceed directly to evaluation.

    // Route based on Workspace Category
    switch (category) {
      case 'real_estate': return await evaluateRealEstateCall(applicationData, transcript);
      case 'medical': return await evaluateMedicalCall(applicationData);
      case 'ecommerce': return await evaluateEcomCall(applicationData);
      case 'startup': return await evaluateSalesCall(applicationData);
      default:
        // Fallback to legacy sentiment-based logic if no category match
        const responses = Object.values(applicationData);
        const positiveKeywords = ['yes', 'yeah', 'sure', 'definitely', 'absolutely', 'interested', 'need', 'want', 'helpful', 'great', 'good'];
        const negativeKeywords = ['no', 'not', 'never', 'don\'t', 'won\'t', 'can\'t'];

        let positiveCount = 0;
        let negativeCount = 0;

        responses.forEach(response => {
          const lowerResponse = String(response).toLowerCase();
          if (positiveKeywords.some(word => lowerResponse.includes(word))) positiveCount++;
          if (negativeKeywords.some(word => lowerResponse.includes(word))) negativeCount++;
        });

        if (positiveCount > negativeCount && positiveCount > 0) return 'YES';
        if (negativeCount > positiveCount) return 'NO';
        return 'MAYBE';
    }
  }

  if (applicationType === 'loan') return await evaluateLoanApplication(applicationData);
  if (applicationType === 'credit_card') return await evaluateCreditCardApplication(applicationData);
  
  return 'INVESTIGATION_REQUIRED';
};

export default genAI;