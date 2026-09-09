import { jest } from '@jest/globals';
import { createModuleSchema, updateModuleSchema } from '../../src/validators/moduleValidator.js';

describe('module question validation', () => {
  // The dashboard posts objects; the old schema declared z.array(z.string()),
  // so creating an agent with any question failed with "Validation failed".
  const dashboardPayload = {
    body: {
      name: 'Support Agent',
      type: 'custom',
      systemPrompt: 'You are helpful.',
      questions: [
        { question: 'What can I help with?', order: 0, required: true },
        { question: 'Anything else?', order: 1, required: true },
      ],
    },
  };

  it('accepts the object shape the dashboard actually sends', () => {
    expect(() => createModuleSchema.parse(dashboardPayload)).not.toThrow();
  });

  it('accepts bare strings too', () => {
    expect(() =>
      createModuleSchema.parse({ body: { name: 'A', questions: ['One?', 'Two?'] } })
    ).not.toThrow();
  });

  it('accepts an agent with no questions', () => {
    expect(() => createModuleSchema.parse({ body: { name: 'A' } })).not.toThrow();
  });

  it('still rejects an empty question', () => {
    expect(() =>
      createModuleSchema.parse({ body: { name: 'A', questions: [{ question: '' }] } })
    ).toThrow();
  });

  it('still requires a name', () => {
    expect(() => createModuleSchema.parse({ body: { questions: [] } })).toThrow();
  });

  it('validates updates, which previously had no schema at all', () => {
    expect(() =>
      updateModuleSchema.parse({ body: { questions: [{ question: 'Changed?' }] } })
    ).not.toThrow();
    expect(() => updateModuleSchema.parse({ body: { name: '' } })).toThrow();
  });
});
