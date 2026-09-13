import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
  },
  demoAgentId: {
    type: String,
    default: null,
  },
  moduleName: {
    type: String,
    default: 'Unknown Module',
  },
  customerName: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  twilioCallSid: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['initiated', 'queued', 'ringing', 'in-progress', 'answered', 'completed', 'failed', 'busy', 'no-answer', 'canceled'],
    default: 'initiated',
  },
  duration: {
    type: Number,
    default: 0,
  },
  responses: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  transcription: {
    type: String,
    default: '',
  },
  liveTranscript: [{
    speaker: String,
    text: String,
    timestamp: Date,
    type: { type: String }
  }],
  summary: {
    type: String,
    default: '',
  },
  evaluation: {
    result: {
      type: String,
      enum: ['YES', 'NO', 'MAYBE', 'INVESTIGATION_REQUIRED', 'DECLINED', 'INTERESTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURE', 'URGENT', 'BOOKED'],
      default: null,
    },
    comments: [{
      type: String,
    }],
    analysis: {
      sentiment: { type: String, enum: ['Enthusiastic', 'Hesitant', 'Annoyed', 'Confused', 'Neutral'], default: 'Neutral' },
      objections: [{ type: String }],
      intentTier: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
      extractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
      competitorMentioned: { type: Boolean, default: false },
    },
    stageAnalysis: {
      totalQuestions: { type: Number, default: 0 },
      questionsReached: { type: Number, default: 0 },
      dropOffPoint: { type: String, default: null },
    },
    metadata: {
      latency: { type: Number, default: 0 },
      providerCost: { type: Number, default: 0 },
    },
  },
  /**
   * Who the call is about.
   *
   * A test call used to carry nothing but a name, so the agent could never say
   * what was actually owed -- it said vague things where a real collections call
   * states the figure. These are the fields a borrower list will carry, so the
   * same shape serves both a rehearsal today and a real run later.
   */
  borrower: {
    loanId: { type: String, default: null },
    amountDue: { type: Number, default: null },
    dueDate: { type: Date, default: null },
    // Days past due, derived at call time from dueDate. Stored because the
    // bucket a call belonged to is a fact about the call, not about today.
    bucket: {
      type: String,
      enum: ['clear', '0', '1', '2', '3', null],
      default: null,
    },
  },

  /**
   * What the call actually produced.
   *
   * The `evaluation` block above is the sales-era shape -- QUALIFIED / BOOKED,
   * objections drawn from Price/Timing/Trust, "did they schedule a site visit".
   * It stays so old rows still load, but nothing new writes to it. A collections
   * call has one job: find out when the money is coming and why it has not.
   */
  collections: {
    outcome: {
      type: String,
      enum: ['promise_to_pay', 'partial_promise', 'dispute', 'hardship',
             'callback', 'refused', 'wrong_number', 'no_answer'],
      default: null,
    },
    // Absolute, never "next Tuesday" -- this is read days after the call.
    promisedOn: { type: Date, default: null },
    promisedAmount: { type: Number, default: null },
    reason: {
      type: String,
      enum: ['job_loss', 'medical', 'business_loss', 'dispute',
             'forgot', 'travelling', 'salary_delayed', 'other', null],
      default: null,
    },
    // Whether the borrower confirmed who they were. False when unclear: talking
    // about a debt to someone who never identified themselves is a compliance
    // problem, so the uncertain case has to read as "no".
    rightPartyContact: { type: Boolean, default: false },
    escalate: { type: Boolean, default: false },
    escalateReason: { type: String, default: null },
    // The borrower's own words, untranslated. The reason a transcript beats a
    // disposition code.
    borrowerQuote: { type: String, default: null },
    language: { type: String, default: null },
  },

  recordingUrl: {
    type: String,
    default: '',
  },
  // A Cartesia voice UUID; see models/Module.js for why the old default broke.
  selectedVoice: {
    type: String,
    default: '79a125e8-cd45-4c13-8a67-188112f4dd22',
  },
  selectedLanguage: {
    type: String,
    default: 'en-US',
  },
  ttsProvider: {
    type: String,
    enum: ['cartesia'],
    default: 'cartesia',
  },
  optimizeFor: {
    type: String,
    enum: ['latency', 'quality'],
    default: 'latency'
  },
  currentStep: {
    type: Number,
    default: 0,
  },
  source: {
    type: String,
    enum: ['web', 'automatic_scheduler'],
    default: 'web',
  },
  priorContext: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

callSchema.index({ userId: 1, workspaceId: 1, createdAt: -1 });


// The two queries a collections desk runs every morning: promises falling due,
// and everything a person still has to deal with.
callSchema.index({ 'collections.promisedOn': 1 });
callSchema.index({ 'collections.escalate': 1, createdAt: -1 });

const Call = mongoose.model('Call', callSchema);

export default Call; 