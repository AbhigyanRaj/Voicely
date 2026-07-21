import { z } from 'zod';

export const createModuleSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Module name is required'),
    type: z.string().optional(),
    questions: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
    ttsProvider: z.string().optional(),
    selectedLanguage: z.string().optional(),
    selectedVoice: z.string().optional()
  })
});
