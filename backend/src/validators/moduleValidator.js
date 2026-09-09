import { z } from 'zod';

/**
 * A single agent question.
 *
 * Accepts the object shape the model stores and the UI sends, and also a bare
 * string for convenience. The previous schema declared `z.array(z.string())`
 * only, while `models/Module.js` requires `{question, order}` objects and the
 * dashboard posts objects -- so creating an agent with *any* question failed
 * validation with a generic "Validation failed", and the UI surfaced it as
 * "Deployment failed. Try again."
 */
const questionSchema = z.union([
  z.string().min(1),
  z.object({
    question: z.string().min(1, 'Question text is required'),
    order: z.number().int().nonnegative().optional(),
    required: z.boolean().optional(),
  }),
]);

export const createModuleSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Module name is required'),
    type: z.string().optional(),
    description: z.string().optional(),
    questions: z.array(questionSchema).optional(),
    systemPrompt: z.string().optional(),
    ttsProvider: z.string().optional(),
    selectedLanguage: z.string().optional(),
    selectedVoice: z.string().optional(),
  }),
});

/** PUT /modules/:id had no validator at all, so raw body went into the update. */
export const updateModuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    questions: z.array(questionSchema).optional(),
    systemPrompt: z.string().optional(),
    ttsProvider: z.string().optional(),
    selectedLanguage: z.string().optional(),
    selectedVoice: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});
