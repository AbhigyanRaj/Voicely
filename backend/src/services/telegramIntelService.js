import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger.js';
import Module from '../models/Module.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Intelligent Parser for Telegram Messages
 * Converts natural language into structured call initiation data
 */
export const parseTelegramRequest = async (text, userContext) => {
    const { currentWorkspace, email } = userContext;
    const category = currentWorkspace?.category || 'startup';
    
    logger.info(`Intelligent Parsing Request from ${email}: "${text}" [Context: ${category}]`);

    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

    const prompt = `
    You are an intelligent terminal parser for Voicely, a voice AI platform.
    Your task is to extract call details from a user's Telegram message.

    USER CONTEXT:
    - Active Workspace Category: ${category}
    - User Email: ${email}
    
    USER MESSAGE:
    "${text}"

    GOAL:
    Extract the following fields in strictly valid JSON:
    {
      "action": "INITIATE_CALL" | "UNKNOWN",
      "customerName": "Name of the person to call",
      "phoneNumber": "10-digit phone number",
      "agentQuery": "Key terms to find the right voice agent (e.g., 'real estate', 'clinic', 'follow up')",
      "missingDetails": ["List of details missing like 'phone number' or 'name'"]
    }

    RULES:
    1. If the user mentions a name, extract it.
    2. If the user mentions a phone number, extract only the digits.
    3. Use the message intent to create an 'agentQuery'. For example, if they say "Regarding the flat", query is "flat" or "real estate".
    4. If the message is just a greeting or unrelated, set action to UNKNOWN.
    5. Return ONLY the raw JSON string.
    `;

    try {
        const result = await model.generateContent(prompt);
        let responseText = result.response.text().trim();
        
        // Strip markdown if present
        responseText = responseText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
        
        const parsed = JSON.parse(responseText);

        // Enhance with Module Matching if action is INITIATE_CALL
        if (parsed.action === 'INITIATE_CALL') {
            let modules = [];
            
            const query = parsed.agentQuery || parsed.moduleQuery;
            if (query) {
                modules = await Module.find({ 
                    userId: userContext._id, 
                    isDeleted: false,
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { type: { $regex: query, $options: 'i' } }
                    ]
                });
            }
            
            if (modules.length === 0) {
                // Try finding modules by category
                modules = await Module.find({
                    userId: userContext._id,
                    isDeleted: false,
                    category: category
                });
            }

            if (modules.length === 0) {
                // Fallback to ANY active module for this user
                modules = await Module.find({
                    userId: userContext._id,
                    isDeleted: false
                });
            }
            
            if (modules.length > 0) {
                parsed.agentId = modules[0]._id.toString();
                parsed.agentName = modules[0].name;
            } else {
                parsed.missingDetails.push('voice agent (no agents found in your account)');
            }
        }

        return parsed;
    } catch (error) {
        logger.error('Telegram Parsing Error:', error);
        return { action: 'UNKNOWN', missingDetails: ['system error'] };
    }
};

/**
 * Generate a friendly confirmation message
 */
export const generateConfirmationMessage = (parsedData, workspaceName) => {
    if (parsedData.action === 'UNKNOWN') {
        return "I'm sorry, I didn't quite catch that. Would you like to initiate a call? Please provide a name and phone number.";
    }

    if (parsedData.missingDetails.length > 0) {
        return `I've noted you want to make a call, but I'm missing: ${parsedData.missingDetails.join(', ')}. Please provide these details.`;
    }

    let msg = `Ready to initiate call!\n\n`;
    msg += `Customer: ${parsedData.customerName}\n`;
    msg += `Phone: ${parsedData.phoneNumber}\n`;
    msg += `Agent: ${parsedData.agentName || parsedData.moduleName || 'Default Assistant'}\n`;
    msg += `Workspace: ${workspaceName}\n\n`;
    msg += `Shall I proceed with the call? Type YES to confirm.`;

    return msg;
};
