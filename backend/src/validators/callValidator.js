import { z } from 'zod';

export const initiateCallSchema = z.object({
  body: z.object({
    moduleId: z.string().min(1, 'Module ID is required'),
    phoneNumber: z.string().min(1, 'Phone number is required'),
    customerName: z.string().optional(),
    selectedVoice: z.string().optional(),
    selectedLanguage: z.string().optional(),
    ttsProvider: z.string().optional()
  })
});
