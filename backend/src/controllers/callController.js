import Call from '../models/Call.js';
import Module from '../models/Module.js';
import { broadcastCallStatus } from '../websocket/liveCallServer.js';
import logger from '../utils/logger.js';
import { getDemoAgentModule } from '../config/demoAgents.js';
import { voiceGenderFor } from '../services/streamingCallHandler.js';
import { greetingTextFor, getGreetingAudio } from '../services/greetingCache.js';
import { resolveLanguage, languageKey, LANGUAGES } from '../config/languages.js';
import { bucketFor } from '../config/buckets.js';

const VOICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Settle the voice for a language.
 *
 * Two ways this used to go wrong. A stored voice could be a legacy Sarvam or
 * Google speaker name ('anushka', 'NEERJA') that Cartesia rejects outright,
 * producing a session with no audio at all -- and that check was only applied on
 * the custom-module branch, so a demo call passed anything straight through.
 * Worse, a voice belonging to a DIFFERENT language than the one selected would
 * be accepted, and a Hindi voice reading Marathi is confident nonsense.
 *
 * So the voice must be a UUID *and* belong to the chosen language; otherwise the
 * language's own default is used.
 */
const resolveVoiceFor = (voice, language) => {
  const spec = resolveLanguage(language);
  if (!voice || !VOICE_ID_PATTERN.test(voice)) return spec.voiceId;

  // Voices are per-language by construction; a voice from another language is a
  // mismatch even when it is a perfectly valid id.
  const belongsToLanguage = Object.entries(LANGUAGES)
    .some(([code, s]) => s.voiceId === voice && languageKey(code) === languageKey(language));
  if (belongsToLanguage) return voice;

  // A voice we do not know about could still be a valid Cartesia id for this
  // language -- the registry only lists our defaults -- so it is allowed through
  // rather than overridden. Only a known-mismatched one is replaced.
  const belongsElsewhere = Object.values(LANGUAGES).some(s => s.voiceId === voice);
  return belongsElsewhere ? spec.voiceId : voice;
};

/**
 * Initiate a browser sandbox call
 */
export const initiateBrowserSandboxCall = async (req, res) => {
    try {
        const {
            moduleId, customerName, selectedVoice, selectedLanguage, ttsProvider, optimizeFor,
            // What the call is about. Optional: the public demo has no loan.
            loanId, amountDue, dueDate,
        } = req.body;
        const userId = req.user ? req.user._id : null;
        const workspaceId = req.user && req.user.currentWorkspace ? req.user.currentWorkspace._id : null;

        logger.info(`Browser Sandbox Call Request: [Customer: ${customerName}] [Module: ${moduleId}] [OptimizeFor: ${optimizeFor}]`);

        if (!customerName || !moduleId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // The greeting the session will open with, so its synthesis can be
        // started here rather than when the session is already waiting on it.
        let greetingModule = null;

        let module = null;
        // These defaults previously named Sarvam/Hindi -- a deleted provider and
        // an unsupported language. 'anushka' is a Sarvam speaker name, which
        // Cartesia rejects as a voice id, so an API caller that omitted a voice
        // got a session that played no audio at all.
        const isDemo = typeof moduleId === 'string' && moduleId.startsWith('demo-agent-');

        // The caller's language decides everything downstream -- speech
        // recognition, the voice, and which persona variant the model is given --
        // so it is settled first and validated. It used to be taken verbatim,
        // checked against nothing, and defaulted to a local 'en-US' constant that
        // disagreed with the shared default in config/languages.js.
        let finalLanguage = languageKey(
            selectedLanguage || (!isDemo ? null : undefined)
        );
        let finalProvider = ttsProvider || 'cartesia';
        let finalVoice;

        if (isDemo) {
            finalVoice = resolveVoiceFor(selectedVoice, finalLanguage);
            const demoDetails = getDemoAgentModule(
                moduleId, voiceGenderFor(finalVoice), finalLanguage
            );
            greetingModule = demoDetails;
            module = { name: demoDetails.name };
        } else {
            module = await Module.findById(moduleId);
            if (!module) return res.status(404).json({ error: 'Module not found' });
            // An explicit choice beats the module's saved one; the saved one is
            // only a starting point.
            finalLanguage = languageKey(selectedLanguage || module.selectedLanguage);
            finalVoice = resolveVoiceFor(selectedVoice || module.selectedVoice, finalLanguage);
            finalProvider = 'cartesia';
            greetingModule = module;
        }

        logger.info(`Sandbox call: [${moduleId}] [${finalLanguage}] [voice ${finalVoice.slice(0, 8)}]`);

        // Warm the opener now, unawaited.
        //
        // Boot-time prewarming only covers the demo agents on the default voice.
        // Any other voice, and every custom agent, would otherwise pay ~700ms of
        // Cartesia synthesis at exactly the moment the session is ready and the
        // user is listening. Starting it here overlaps it with the WebSocket
        // handshake, the Deepgram connection and the TTS socket -- about a second
        // of setup -- so the audio is normally cached before anyone needs it.
        // Failures are the cache's problem, not this request's.
        if (greetingModule) {
            const gender = voiceGenderFor(finalVoice);
            getGreetingAudio({
                voiceId: finalVoice,
                language: resolveLanguage(finalLanguage).ttsLang,
                isWebCall: true,
                text: greetingTextFor(greetingModule, gender, finalLanguage),
            }).catch(() => {});
        }

        // Generate a unique browser sandbox Call SID
        const sandboxCallSid = 'browser_sandbox_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

        // Derived rather than accepted from the client, so the bucket can never
        // disagree with the date it came from. Stored on the call because which
        // bucket a borrower was in when they were phoned is a fact about that
        // call -- recomputing it next week would rewrite history.
        const parsedDue = dueDate ? new Date(dueDate) : null;
        const borrower = {
            loanId: typeof loanId === 'string' ? loanId.trim().slice(0, 40) || null : null,
            amountDue: Number.isFinite(Number(amountDue)) && Number(amountDue) > 0
                ? Math.round(Number(amountDue)) : null,
            dueDate: parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : null,
            bucket: null,
        };
        borrower.bucket = bucketFor(borrower.dueDate);

        const callRecord = await Call.create({
            userId,
            workspaceId,
            moduleId: isDemo ? undefined : moduleId,
            moduleName: module.name,
            demoAgentId: isDemo ? moduleId : undefined,
            customerName: customerName.trim(),
            phoneNumber: '+1000000000', // Mock Sandbox phone number
            twilioCallSid: sandboxCallSid,
            selectedVoice: finalVoice,
            selectedLanguage: finalLanguage,
            ttsProvider: finalProvider,
            optimizeFor: optimizeFor || 'latency',
            status: 'ringing', // Start as ringing to simulate standard flow
            currentStep: 0,
            source: 'web',
            borrower,
        });

        broadcastCallStatus(callRecord._id.toString(), 'started', {
            customerName: callRecord.customerName,
            phoneNumber: callRecord.phoneNumber,
            moduleName: module.name
        });

        res.json({ success: true, call: callRecord });
    } catch (error) {
        logger.error('Failed to initiate browser sandbox call', error);
        res.status(500).json({ error: 'Failed to initiate browser sandbox call', message: error.message });
    }
};




/**
 * Get call history with pagination
 */
/**
 * Fields a list needs. The full document carries the whole transcript, which is
 * the bulk of a call record and is never read on a list screen -- fetching fifty
 * of those to render fifty rows was the single most expensive thing this
 * endpoint did.
 */
const LIST_PROJECTION = [
    'customerName', 'selectedLanguage', 'duration', 'status', 'createdAt',
    'moduleId', 'moduleName', 'summary', 'borrower', 'collections',
].join(' ');

/** Outcomes that need a person, mirroring NEEDS_HUMAN on the client. */
const NEEDS_HUMAN = ['dispute', 'hardship', 'refused'];

/**
 * The conversations list.
 *
 * Supported only `page` and `limit` before, while the client was already sending
 * `status` and `moduleId` that the controller silently dropped -- so every filter
 * the UI offered was a lie. Filtering now happens in the database, served by the
 * `collections.*` indexes rather than by reading the collection.
 */
export const getCallHistory = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const skip = (page - 1) * limit;

        const query = { userId: req.user._id };
        if (req.user.currentWorkspace) {
            query.workspaceId = req.user.currentWorkspace._id;
        }

        const { outcome, language, needsHuman, moduleId, from, to, search } = req.query;

        if (outcome) {
            // Comma-separated, so one request can ask for promises of either kind.
            const wanted = String(outcome).split(',').map(o => o.trim()).filter(Boolean);
            if (wanted.length > 0) query['collections.outcome'] = { $in: wanted };
        }
        if (needsHuman === 'true') {
            // Either the analysis raised it, or the outcome is one that always
            // needs a person. Both, because the escalate flag can be set for
            // reasons the outcome does not capture -- a request to stop calling.
            query.$or = [
                { 'collections.escalate': true },
                { 'collections.outcome': { $in: NEEDS_HUMAN } },
            ];
        }
        if (language) query.selectedLanguage = languageKey(language);
        if (moduleId) query.moduleId = moduleId;

        if (from || to) {
            query.createdAt = {};
            if (from) query.createdAt.$gte = new Date(from);
            if (to) query.createdAt.$lte = new Date(to);
        }
        if (search) {
            // Escaped: a borrower name or loan id is user input, and an unescaped
            // '(' would throw rather than simply match nothing.
            const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(safe, 'i');
            query.$and = [{ $or: [
                { customerName: rx },
                { 'borrower.loanId': rx },
                { 'collections.borrowerQuote': rx },
            ] }];
        }

        const [calls, total] = await Promise.all([
            Call.find(query)
                .select(LIST_PROJECTION)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('moduleId', 'name')
                .lean(),
            Call.countDocuments(query),
        ]);

        // A deleted module would otherwise render as a blank column.
        const formattedCalls = calls.map(callObj => {
            if (!callObj.moduleId && callObj.moduleName) {
                callObj.moduleId = { name: `${callObj.moduleName} (Deleted)` };
            } else if (!callObj.moduleId) {
                callObj.moduleId = { name: 'Deleted Module' };
            }
            return callObj;
        });

        res.json({
            success: true,
            calls: formattedCalls,
            pagination: { total, page, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        logger.error('Error fetching call history', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
};

/**
 * Get single call details
 */
export const getCallById = async (req, res) => {
    try {
        const call = await Call.findById(req.params.id)
            .populate('moduleId', 'name');
            
        if (!call) {
            return res.status(404).json({ error: 'Call not found' });
        }

        // Check ownership
        if (call.userId.toString() !== req.user._id.toString()) {
            logger.warn(`[getCallById] Ownership mismatch! Call.userId: ${call.userId}, Req.user._id: ${req.user._id}`);
            return res.status(403).json({ error: 'Unauthorized access to call' });
        }

        // Patch response to avoid frontend crashes if module was deleted
        const callObj = call.toObject();
        if (!callObj.moduleId && callObj.moduleName) {
            callObj.moduleId = { name: `${callObj.moduleName} (Deleted)` };
        } else if (!callObj.moduleId) {
            callObj.moduleId = { name: 'Deleted Module' };
        }

        res.json({
            success: true,
            call: callObj
        });
    } catch (error) {
        logger.error('Error fetching call', error);
        res.status(500).json({ error: 'Failed to fetch call details' });
    }
};
