import TelegramBot from 'node-telegram-bot-api';
import User from '../models/User.js';
import Module from '../models/Module.js';
import Call from '../models/Call.js';
import Workspace from '../models/Workspace.js';
import twilio from 'twilio';
import { formatPhoneNumber } from '../utils/phoneUtils.js';
import { parseTelegramRequest, generateConfirmationMessage } from './telegramIntelService.js';
import * as callService from './callService.js';
import logger from '../utils/logger.js';
import fetch from 'node-fetch';
import { createClient } from '@deepgram/sdk';
import mongoose from 'mongoose';

let bot;
const userStates = {};

const getTwilioClient = () => {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
};

const mainMenuKeyboard = {
    keyboard: [
        [{ text: 'AGENTS' }, { text: 'WORKSPACES' }],
        [{ text: 'LAST CALL' }, { text: 'ACCOUNT' }],
        [{ text: '🎙 VOICE CMD' }, { text: 'HELP' }]
    ],
    resize_keyboard: true,
    persistent: true
};

const sendMainMenu = (chatId, text = 'SYSTEM: MAIN MENU') => {
    if (bot) bot.sendMessage(chatId, text, { reply_markup: mainMenuKeyboard });
};

export const initTelegramBot = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        logger.warn('TELEGRAM_BOT_TOKEN not found in environment, bot will not start');
        return;
    }

    bot = new TelegramBot(token, { polling: true });
    logger.success('Telegram Bot Service Initialized');

    // Set persistent commands menu
    bot.setMyCommands([
        { command: 'start', description: 'Link account or reset bot' },
        { command: 'agents', description: 'View and use your voice agents' },
        { command: 'account', description: 'Check your linking status' },
        { command: 'help', description: 'Standard usage guide' }
    ]);

    // --- COMMAND HANDLERS ---

    bot.onText(/\/start (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const linkingCode = match[1];
        logger.info(`BOT LINK ATTEMPT: [ChatId: ${chatId}] [Code: ${linkingCode}]`);
        logger.info(`DB NAME: ${mongoose.connection.name} | COLLECTION: ${User.collection.name}`);
        try {
            const user = await User.findOne({
                'telegram.linkingCode.code': linkingCode,
                'telegram.linkingCode.expiresAt': { $gt: new Date() }
            });
            if (!user) return bot.sendMessage(chatId, 'Invalid or expired linking code.');

            await User.updateMany(
                { 'telegram.chatId': chatId.toString() },
                { $unset: { 'telegram.chatId': "" } }
            );

            const updateResult = await User.findByIdAndUpdate(user._id, {
                $set: { 'telegram.chatId': chatId.toString() },
                $unset: { 'telegram.linkingCode': "" }
            }, { new: true });
            
            logger.info(`LINK UPDATE RESULT: ${JSON.stringify(updateResult?.telegram)}`);
            
            if (updateResult?.telegram?.chatId === chatId.toString()) {
                logger.info(`SUCCESS: Telegram link verified for ${user.email}`);
            } else {
                logger.error(`VERIFICATION FAILED: Expected ${chatId}, got ${updateResult?.telegram?.chatId}`);
            }
            
            bot.sendMessage(chatId, `SUCCESS: Account linked to ${user.email}. Use the menu below to navigate.`, {
                reply_markup: mainMenuKeyboard
            });
        } catch (error) {
            logger.error('Bot Link Error:', error);
            bot.sendMessage(chatId, 'ERROR: Link failed. Please check your code.');
        }
    });

    bot.onText(/\/start$/, (msg) => {
        bot.sendMessage(msg.chat.id, 'Voicely TERMINAL v1.0\n\nLink your account via the dashboard to access voice agents.\nUse navigation buttons below for quick access.', {
            reply_markup: mainMenuKeyboard
        });
    });

    bot.onText(/\/logout/, (msg) => handleLogout(msg.chat.id));
    bot.onText(/\/agents/, (msg) => handleAgents(msg.chat.id));
    bot.onText(/\/account/, (msg) => handleAccount(msg.chat.id));
    bot.onText(/\/help/, (msg) => handleHelp(msg.chat.id));

    // --- MESSAGE DECISION TREE ---

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text?.toUpperCase();

        logger.info(`BOT MESSAGE: [ChatId: ${chatId}] [Text: ${text}]`);
        logger.info(`BOT DB STATE: [DB: ${mongoose.connection.name}] [MongooseState: ${mongoose.connection.readyState}]`);

        if (!text || msg.text.startsWith('/')) return;

        const state = userStates[chatId];

        // Handle Main Menu Buttons
        const user = await User.findOne({ 'telegram.chatId': chatId.toString() }).populate('currentWorkspace');
        if (text === 'AGENTS') return handleAgents(chatId);
        if (text === 'WORKSPACES') return handleWorkspaces(chatId);
        if (text === 'LAST CALL') return handleLastCall(chatId);
        if (text === 'ACCOUNT') return handleAccount(chatId);
        if (text === 'HELP') return handleHelp(chatId);
        if (text === '🎙 VOICE CMD' || text.includes('VOICE CMD')) {
            return bot.sendMessage(chatId, 
                "🎙 *HOW TO RECORD VOICE COMMANDS*\n\n" +
                "1. Look at the *Camera* icon in the bottom right corner.\n" +
                "2. *TAP IT ONCE* – it will switch to a *Microphone* icon.\n" +
                "3. *HOLD THE MICROPHONE* to record your command.\n\n" +
                "Example: \"Call Rohan at 9876543210 about the property.\"",
                { parse_mode: 'Markdown' }
            );
        }
        if (text === 'CANCEL') {
            delete userStates[chatId];
            return sendMainMenu(chatId, 'ACTION CANCELLED. Returning to main menu.');
        }

        // NL Confirmation Flow
        if (state?.step === 'CONFIRMING_NL_CALL') {
            if (text === 'YES') {
                const callState = { ...state.parsedData };
                delete userStates[chatId];
                await bot.sendMessage(chatId, 'INITIATING CALL...');
                return await triggerCall(chatId, callState);
            } else {
                delete userStates[chatId];
                return sendMainMenu(chatId, 'CALL DISCARDED.');
            }
        }

        // Sequential Call Flow Validation
        if (state) {
            // ... (keep existing sequential steps for fallback)
            if (state.step === 'AWAITING_NAME') {
                state.name = msg.text.trim();
                state.step = 'AWAITING_PHONE';
                return bot.sendMessage(chatId, `NAME: ${state.name}\n\nINPUT: Please provide the phone number.`, {
                    reply_markup: {
                        keyboard: [[{ text: 'CANCEL' }]],
                        resize_keyboard: true
                    }
                });
            } else if (state.step === 'AWAITING_PHONE') {
                const phone = formatPhoneNumber(msg.text.trim());
                if (!phone) {
                    return bot.sendMessage(chatId, 'ERROR: Invalid phone format. Please enter a valid 10-digit number.');
                }
                state.phone = phone;
                state.agentId = state.agentId || state.moduleId; // preserve
                state.step = 'READY';
                return bot.sendMessage(chatId, `DESTINATION: ${state.phone}\n\nSelect Voice:`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'NEERJA (Female)', callback_data: `set_voice_NEERJA` }],
                            [{ text: 'PRABHAT (Male)', callback_data: `set_voice_PRABHAT` }],
                            [{ text: '[ CANCEL ]', callback_data: 'cancel_flow' }]
                        ]
                    }
                });
            }
        }

        // Intelligent NL Parsing Fallback
        if (user) {
            const parsed = await parseTelegramRequest(msg.text, user);
            if (parsed.action === 'INITIATE_CALL') {
                userStates[chatId] = { step: 'CONFIRMING_NL_CALL', parsedData: parsed };
                const confirmMsg = generateConfirmationMessage(parsed, user.currentWorkspace?.name || 'Default');
                return bot.sendMessage(chatId, confirmMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [[{ text: 'YES' }, { text: 'CANCEL' }]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
            }

            bot.sendMessage(chatId, 'SYSTEM: UNRECOGNIZED INPUT\n\nI couldn\'t understand that request. Try saying "Call Rohan at 9876543210 about real estate".');
            sendMainMenu(chatId);
        } else {
            bot.sendMessage(chatId, 'SYSTEM: TERMINAL LOCKED\n\nPlease link your Voicely account to proceed.\nUse /start <linking_code> to begin.');
        }
    });

    bot.on('voice', async (msg) => {
        const chatId = msg.chat.id;
        try {
            const user = await User.findOne({ 'telegram.chatId': chatId.toString() }).populate('currentWorkspace');
            if (!user) return bot.sendMessage(chatId, 'SYSTEM: TERMINAL LOCKED\n\nPlease link your account to use voice commands.');

            bot.sendChatAction(chatId, 'typing');
            
            const fileLink = await bot.getFileLink(msg.voice.file_id);
            const response = await fetch(fileLink);
            const buffer = await response.buffer();

            const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
            const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                buffer,
                { model: 'nova-2', smart_format: true, language: 'en-IN' }
            );

            if (error) throw error;
            const transcript = result.results.channels[0].alternatives[0].transcript;

            if (!transcript || transcript.trim().length < 2) {
                return bot.sendMessage(chatId, 'SYSTEM: Audio too short or unclear. Please try again.');
            }

            bot.sendMessage(chatId, `VOICE INPUT: "${transcript}"`);

            const parsed = await parseTelegramRequest(transcript, user);
            if (parsed.action === 'INITIATE_CALL') {
                userStates[chatId] = { step: 'CONFIRMING_NL_CALL', parsedData: parsed };
                const confirmMsg = generateConfirmationMessage(parsed, user.currentWorkspace?.name || 'Default');
                return bot.sendMessage(chatId, confirmMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [[{ text: 'YES' }, { text: 'CANCEL' }]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
            }

            bot.sendMessage(chatId, 'SYSTEM: Unable to extract call details from your voice. Try saying "Call [Name] at [Number]".');
        } catch (e) {
            logger.error('Voice Processing Error:', e);
            bot.sendMessage(chatId, 'ERROR: Failed to process voice command.');
        }
    });

    // --- CALLBACK QUERIES ---

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        try {
            if (data.startsWith('view_agent_')) {
                const agentId = data.split('_')[2];
                const agent = await Module.findById(agentId);
                if (!agent) return bot.answerCallbackQuery(query.id, { text: 'ERROR: Not found' });
                bot.editMessageText(`AGENT: ${agent.name.toUpperCase()}\nTYPE: ${agent.type.toUpperCase()}`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '[ START CALL ]', callback_data: `start_call_init_${agentId}` }],
                            [{ text: '[ BACK TO LIST ]', callback_data: 'list_agents' }]
                        ]
                    }
                });
            }

            if (data === 'list_agents') {
                const user = await User.findOne({ 'telegram.chatId': chatId.toString() });
                const agents = await Module.find({ userId: user._id, isDeleted: false });
                const buttons = agents.map(m => ([{ text: m.name.toUpperCase(), callback_data: `view_agent_${m._id}` }]));
                bot.editMessageText('SELECT AGENT:', {
                    chat_id: chatId, message_id: query.message.message_id,
                    reply_markup: { inline_keyboard: buttons }
                });
            }

            if (data.startsWith('start_call_init_')) {
                userStates[chatId] = { step: 'AWAITING_NAME', agentId: data.split('_')[3] };
                bot.sendMessage(chatId, 'INITIATING CALL SEQUENCE\n---\nINPUT: Please enter the Customer Name.', {
                    reply_markup: {
                        keyboard: [[{ text: 'CANCEL' }]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
            }

            if (data === 'cancel_flow') {
                delete userStates[chatId];
                bot.editMessageText('ACTION: TERMINATED', { chat_id: chatId, message_id: query.message.message_id });
                bot.sendMessage(chatId, 'Returning to main menu.', { reply_markup: mainMenuKeyboard });
            }

            if (data.startsWith('set_voice_')) {
                const state = userStates[chatId];
                if (!state) return bot.answerCallbackQuery(query.id, { text: 'ERROR: Session Expired' });
                state.voice = data.split('_')[2];
                state.step = 'AWAITING_LANG';
                bot.editMessageText(`VOICE: ${state.voice}\n\nSELECT: Choose Language:`, {
                    chat_id: chatId, message_id: query.message.message_id,
                    reply_markup: { inline_keyboard: [[{ text: 'ENGLISH', callback_data: 'set_lang_english' }, { text: 'HINDI', callback_data: 'set_lang_hindi' }]] }
                });
            }

            if (data.startsWith('set_lang_')) {
                const state = userStates[chatId];
                if (!state) return bot.answerCallbackQuery(query.id, { text: 'ERROR: Session Expired' });
                state.lang = data.split('_')[2];
                bot.editMessageText('SYSTEM: INITIATING CALL...', { chat_id: chatId, message_id: query.message.message_id });
                await triggerCall(chatId, state);
                delete userStates[chatId];
            }

            if (data.startsWith('switch_ws_')) {
                const wsId = data.split('_')[2];
                const user = await User.findOne({ 'telegram.chatId': chatId.toString() });
                if (!user) return bot.answerCallbackQuery(query.id, { text: 'ERROR: Auth required' });

                const workspace = await Workspace.findById(wsId);
                if (!workspace) return bot.answerCallbackQuery(query.id, { text: 'ERROR: Not found' });

                user.currentWorkspace = workspace._id;
                await user.save();

                bot.editMessageText(`WORKSPACE SWITCHED\n\nActive: ${workspace.name.toUpperCase()}\nCategory: ${workspace.category.toUpperCase()}`, {
                    chat_id: chatId,
                    message_id: query.message.message_id
                });
                sendMainMenu(chatId);
            }

            if (data.startsWith('call_again_')) {
                const callId = data.split('_')[2];
                const lastCall = await Call.findById(callId);
                if (!lastCall) return bot.answerCallbackQuery(query.id, { text: 'ERROR: Call not found' });
                
                userStates[chatId] = { 
                    step: 'CONFIRMING_NL_CALL', 
                    parsedData: {
                        action: 'INITIATE_CALL',
                        customerName: lastCall.customerName,
                        phoneNumber: lastCall.phoneNumber,
                        agentId: lastCall.moduleId.toString()
                    }
                };
                
                bot.sendMessage(chatId, `RE-INITIATING CALL\n\nTarget: ${lastCall.customerName}\nNumber: ${lastCall.phoneNumber}\n\nProceed?`, {
                    reply_markup: {
                        keyboard: [[{ text: 'YES' }, { text: 'CANCEL' }]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
            }

            if (data === 'view_analytics') {
                bot.sendMessage(chatId, 'Analytics Dashboard: https://voicely-ai.vercel.app/analytics');
            }

            bot.answerCallbackQuery(query.id);
        } catch (e) {
            logger.error('Bot Callback Query Error:', e);
        }
    });

    // --- HELPER HANDLERS ---

    async function handleLogout(chatId) {
        try {
            const res = await User.updateMany(
                { 'telegram.chatId': chatId.toString() },
                { $unset: { 'telegram.chatId': "" } }
            );
            if (res.modifiedCount > 0) {
                bot.sendMessage(chatId, 'SUCCESS: Account unlinked. Use /start <linking_code> to connect another ID.', {
                    reply_markup: { remove_keyboard: true }
                });
            } else {
                bot.sendMessage(chatId, 'NOTICE: No linked account found.', {
                    reply_markup: { remove_keyboard: true }
                });
            }
        } catch (error) {
            logger.error('Bot Logout Error:', error);
            bot.sendMessage(chatId, 'ERROR: Logout process failed.');
        }
    }

    async function handleAgents(chatId) {
        try {
            const chatIdStr = chatId.toString();
            const user = await User.findOne({ 'telegram.chatId': chatIdStr });
            
            if (!user) {
                logger.warn(`AUTH FAILURE: No user found with chatId ${chatIdStr}`);
                return bot.sendMessage(chatId, 'NOTICE: Authentication required. Link account first.');
            }
            const agents = await Module.find({ userId: user._id, isDeleted: false });
            if (agents.length === 0) return bot.sendMessage(chatId, 'NOTICE: No voice agents found.');
            
            const buttons = agents.map(m => ([{ 
                text: m.name.toUpperCase(), 
                callback_data: `view_agent_${m._id}` 
            }]));
            
            bot.sendMessage(chatId, 'SYSTEM: SELECT AGENT', { 
                reply_markup: { inline_keyboard: buttons } 
            });
        } catch (error) {
            logger.error('Bot Agents Error:', error);
            bot.sendMessage(chatId, 'ERROR: Failed to retrieve agents.');
        }
    }

    async function handleAccount(chatId) {
        try {
            const user = await User.findOne({ 'telegram.chatId': chatId.toString() }).populate('currentWorkspace');
            if (!user) return bot.sendMessage(chatId, 'STATUS: UNLINKED\n\nVisit your account settings on the web to link this bot.');

            let status = `ACCOUNT PROFILE\n---\n`;
            status += `Email: ${user.email}\n`;
            status += `Workspace: ${user.currentWorkspace?.name || 'None'}\n`;
            status += `Calls Made: ${user.totalCallsMade}\n`;
            status += `Plan: ${user.subscription.tier.toUpperCase()}`;

            bot.sendMessage(chatId, status);
        } catch (error) {
            bot.sendMessage(chatId, 'ERROR: Could not fetch account info.');
        }
    }

    async function handleWorkspaces(chatId) {
        try {
            const user = await User.findOne({ 'telegram.chatId': chatId.toString() }).populate('currentWorkspace');
            if (!user) return bot.sendMessage(chatId, 'NOTICE: Authentication required.');

            const workspaces = await Workspace.find({
                $or: [{ userId: user._id }, { 'members.user': user._id }]
            });

            if (workspaces.length === 0) return bot.sendMessage(chatId, 'NOTICE: No workspaces found.');

            const buttons = workspaces.map(ws => ([{
                text: `${ws._id.toString() === user.currentWorkspace?._id.toString() ? '[ACTIVE] ' : ''}${ws.name.toUpperCase()}`,
                callback_data: `switch_ws_${ws._id}`
            }]));

            bot.sendMessage(chatId, 'SELECT ACTIVE WORKSPACE', { 
                reply_markup: { inline_keyboard: buttons } 
            });
        } catch (error) {
            logger.error('Bot Workspaces Error:', error);
            bot.sendMessage(chatId, 'ERROR: Failed to retrieve workspaces.');
        }
    }

    async function handleLastCall(chatId) {
        try {
            const user = await User.findOne({ 'telegram.chatId': chatId.toString() });
            if (!user) return bot.sendMessage(chatId, 'NOTICE: Authentication required.');

            const lastCall = await Call.findOne({ userId: user._id }).sort({ createdAt: -1 });
            if (!lastCall) return bot.sendMessage(chatId, 'NOTICE: No call records found.');

            await sendIntelligentSummary(user._id, lastCall);
        } catch (error) {
            logger.error('Bot Last Call Error:', error);
            bot.sendMessage(chatId, 'ERROR: Failed to retrieve last call.');
        }
    }

    function handleHelp(chatId) {
        const helpText = `Voicely INTELLIGENT BOT GUIDE\n---\n` +
            `*VOICE COMMANDS*:\n` +
            `Record a voice memo (voice note) saying "Call John about the property" to initiate a call instantly using AI parsing.\n\n` +
            `*MANAGEMENT*:\n` +
            `1. AGENTS: Browse and use specific voice agents manually.\n` +
            `2. WORKSPACES: Switch contexts (Real Estate, Medical, etc.).\n` +
            `3. UPDATES: Get automated summaries when a call ends.\n\n` +
            `*COMMANDS*:\n` +
            `Type /logout to unlink your account.`;
        bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard });
    }
};

async function triggerCall(chatId, state) {
    try {
        const user = await User.findOne({ 'telegram.chatId': chatId.toString() }).populate('currentWorkspace');
        if (!user) throw new Error('Authentication required.');

        const customerName = state.customerName || state.name;
        const phoneNumber = formatPhoneNumber(state.phoneNumber || state.phone);
        const agentId = state.agentId || state.moduleId;
        
        if (!phoneNumber) throw new Error('Invalid phone number.');
        if (!agentId) throw new Error('No voice agent selected.');

        logger.info(`Bot Triggering Call: [Customer: ${customerName}] [Phone: ${phoneNumber}] [Agent: ${agentId}]`);

        const twilioCall = await callService.initiateCall({
            moduleId: agentId,
            phoneNumber,
            customerName,
            selectedVoice: state.voice || state.selectedVoice || 'NEERJA',
            selectedLanguage: state.lang || state.selectedLanguage || 'en-IN',
            userId: user._id
        });

        // Create Database Record for Tracking
        await Call.create({
            userId: user._id,
            workspaceId: user.currentWorkspace?._id,
            moduleId: agentId,
            customerName,
            phoneNumber,
            twilioCallSid: twilioCall.sid,
            status: 'initiated',
            currentStep: 0,
            selectedVoice: state.voice || state.selectedVoice || 'NEERJA',
            selectedLanguage: state.lang || state.selectedLanguage || 'en-IN',
            source: 'telegram'
        });

        bot.sendMessage(chatId, `SYSTEM: CALL INITIATED\nSID: ${twilioCall.sid}\nDEST: ${phoneNumber}`, {
            reply_markup: mainMenuKeyboard
        });
    } catch (e) {
        logger.error('Twilio Call Trigger Error:', e);
        bot.sendMessage(chatId, `ERROR: ${e.message}`, { reply_markup: mainMenuKeyboard });
    }
}

/**
 * Send a simple update message by user ID
 */
export const sendUpdateByUserId = async (userId, text) => {
    try {
        const user = await User.findById(userId);
        if (user?.telegram?.chatId && bot) {
            // Escape underscores to prevent Markdown parsing errors
            const sanitizedText = text.replace(/_/g, '\\_');
            await bot.sendMessage(user.telegram.chatId, sanitizedText, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        logger.error('Bot Push Error:', e);
    }
};

/**
 * Send a rich, intelligent call summary
 */
export const sendIntelligentSummary = async (userId, callData) => {
    try {
        const user = await User.findById(userId).populate('currentWorkspace');
        if (!user?.telegram?.chatId || !bot) return;

        const category = user.currentWorkspace?.category || 'startup';
        const analysis = callData.evaluation?.analysis || {};

        // Professional Formatting
        let msg = `INTELLIGENT CALL SUMMARY\n`;
        msg += `Workspace: ${user.currentWorkspace?.name || 'Default'}\n`;
        msg += `Customer: ${callData.customerName}\n`;
        msg += `---\n\n`;

        // Category-Specific Insights
        if (category === 'real_estate') {
            msg += `RE Intent: ${analysis.intentTier === 'High' ? 'HOT LEAD' : 'SCOUTING'}\n`;
            msg += `Key extracted: ${JSON.stringify(analysis.extractedData)}\n`;
        } else if (category === 'medical') {
            msg += `Medical Urgency: ${analysis.sentiment === 'Annoyed' ? 'URGENT' : 'GENERAL'}\n`;
        }

        msg += `\nAnalysis:\n${callData.summary || 'No summary available.'}\n\n`;

        msg += `Sentiment: ${analysis.sentiment || 'Neutral'}\n`;
        if (analysis.objections?.length > 0) {
            msg += `Objections: ${analysis.objections.join(', ')}\n`;
        }

        msg += `\nDuration: ${callData.duration}s`;

        // Escape underscores for Markdown
        const sanitizedText = msg.replace(/_/g, '\\_');
        
        await bot.sendMessage(user.telegram.chatId, sanitizedText, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'RE-CALL CUSTOMER', callback_data: `call_again_${callData._id}` }],
                    [{ text: 'OPEN DASHBOARD', url: 'https://voicely-ai.vercel.app/analytics' }]
                ]
            }
        });
    } catch (e) {
        logger.error('Bot Summary Push Error:', e);
    }
};

export default bot;
