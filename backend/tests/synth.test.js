const Synthesizer = require('../src/synthesizer/synth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Mock dependencies
jest.mock('../src/db', () => ({
  query: jest.fn()
}));
jest.mock('@google/generative-ai');

describe('Synthesizer Engine', () => {
  let synth;
  let mockGenerateContent;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: mockGenerateContent
      })
    }));

    // Dummy lanes
    const dummyLane = { evaluate: async () => ({ bias: 'mixed', tier: 'low', score: 0, basis: '' }) };
    synth = new Synthesizer(dummyLane, dummyLane, dummyLane, dummyLane);
    process.env.GEMINI_API_KEY = 'test-key';
  });

  test('1. Hard-gate logic: mechanical=WAIT + Gemini attempts LONG/SHORT -> WAIT', async () => {
    const snapshot = { verdict: 'WAIT', confidence: 'low', point_differential: 10, mech_entry: 1.1, mech_invalidation: 1.0, mech_target: 1.2 };
    
    // Gemini tries to output LONG
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ verdict: 'LONG' }) }
    });

    const result = await synth.getAiNarrative('EUR_USD', '15m', snapshot, {}, null, [], 'strict');
    
    expect(result.verdict).toBe('WAIT');
  });

  test('2. Hard-gate logic: mechanical=LONG + Gemini attempts SHORT -> WAIT', async () => {
    const snapshot = { verdict: 'LONG', confidence: 'high', point_differential: 50, mech_entry: 1.1, mech_invalidation: 1.0, mech_target: 1.2 };
    
    // Gemini tries to output SHORT
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ verdict: 'SHORT' }) }
    });

    const result = await synth.getAiNarrative('EUR_USD', '15m', snapshot, {}, null, [], 'strict');
    
    expect(result.verdict).toBe('WAIT');
  });

  test('3. Conviction score formula: fixed known inputs', async () => {
    // 2 Confluence factors: Killzone active + MTF Alignment
    const snapshot = { verdict: 'LONG', confidence: 'high', point_differential: 50, mech_entry: 1.1, mech_invalidation: 1.0, mech_target: 1.2 };
    const mtfZones = { 'H4': { marketStructure: { trend: 'bullish' } } };
    const zones = { current_session: 'London Killzone' };

    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ verdict: 'LONG' }) }
    });

    const result = await synth.getAiNarrative('EUR_USD', '15m', snapshot, zones, mtfZones, [], 'strict');
    
    // Formula: Math.min(100, Math.round((50 * 0.6) + (2 * 10))) = 30 + 20 = 50
    expect(result.overview_confidence_score).toBe(50);
  });

  test('4. Citation validator: feed a hallucinated price -> rejects payload', async () => {
    const snapshot = { verdict: 'LONG', confidence: 'high', point_differential: 50, mech_entry: 1.1, mech_invalidation: 1.0, mech_target: 1.2 };
    
    // The ictContext will have only specific numbers. We will pass a clearly hallucinated number (9.9999)
    // 1.1, 1.0, 1.2 are the only floats in context via mech_entry, etc.
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ verdict: 'LONG', overview: 'I like level 9.9999' }) }
    });

    const result = await synth.getAiNarrative('EUR_USD', '15m', snapshot, {}, null, [], 'strict');
    
    // It should fail the regex validation and fall back to template
    expect(result.overview).toContain('Automated mechanical fallback');
  });

  test('5. MTF penalty: known daily/H4 bearish + attempted LONG -> -30 applied', async () => {
    // We mock the evaluateRuleBased directly by overriding lanes just for this test
    synth.lanes = {
      technical: { evaluate: async () => ({ bias: 'bull', tier: 'high', score: 60, basis: 'test' }) },
      flow: { evaluate: async () => ({ bias: 'mixed', tier: 'low', score: 0, basis: '' }) },
      narrative: { evaluate: async () => ({ bias: 'mixed', tier: 'low', score: 0, basis: '' }) },
      macro: { evaluate: async () => ({ bias: 'mixed', tier: 'low', score: 0, basis: '' }) }
    };
    
    const mtfZones = { 'D': { marketStructure: { trend: 'bearish' } } };
    
    const snapshot = await synth.evaluateRuleBased('EUR_USD', '15m', 1.05, {}, null, mtfZones);
    
    // Without penalty, bullScore would be 60 -> LONG. 
    // With penalty, 60 - 30 = 30 -> WAIT (since it's < 40).
    expect(snapshot.verdict).toBe('WAIT');
  });
});
