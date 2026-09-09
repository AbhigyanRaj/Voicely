import { describe, it, expect } from 'vitest';
import {
  decodeAudioPayload,
  linearToMuLaw,
  muLawToLinear,
  float32ToPCM16,
} from '../audioUtils';

/** Node has Buffer; the browser has btoa. Use whichever exists. */
const toBase64 = (bytes: Uint8Array) =>
  typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64')
    : btoa(String.fromCharCode(...bytes));

describe('decodeAudioPayload', () => {
  it('decodes pcm_f32le, the wideband format Cartesia streams to the browser', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const payload = toBase64(new Uint8Array(samples.buffer));

    const decoded = decodeAudioPayload(payload, 'pcm_f32le');

    expect(decoded.length).toBe(5);
    expect(Array.from(decoded)).toEqual([0, 0.5, -0.5, 1, -1]);
  });

  it('decodes pcm_f32le from a payload whose bytes are not 4-byte aligned', () => {
    // atob yields a byte array with no alignment guarantee, and a Float32Array
    // over a misaligned buffer throws. The decoder copies to sidestep that.
    const samples = new Float32Array([0.25, -0.75]);
    const padded = new Uint8Array(samples.buffer.byteLength + 1);
    padded.set(new Uint8Array(samples.buffer), 0);

    const decoded = decodeAudioPayload(toBase64(padded.subarray(0, 8)), 'pcm_f32le');
    expect(Array.from(decoded)).toEqual([0.25, -0.75]);
  });

  it('decodes pcm_s16le to the -1..1 range', () => {
    const pcm = new Int16Array([0, 16384, -16384, 32767]);
    const decoded = decodeAudioPayload(toBase64(new Uint8Array(pcm.buffer)), 'pcm_s16le');

    expect(decoded.length).toBe(4);
    expect(decoded[0]).toBe(0);
    expect(decoded[1]).toBeCloseTo(0.5, 4);
    expect(decoded[2]).toBeCloseTo(-0.5, 4);
    expect(decoded[3]).toBeCloseTo(1, 3);
  });

  it('decodes mulaw, and round-trips within G.711 quantisation error', () => {
    const original = [0, 0.25, -0.25, 0.5, -0.5, 0.9, -0.9];
    const encoded = new Uint8Array(
      original.map((v) => linearToMuLaw(v < 0 ? v * 0x8000 : v * 0x7fff))
    );

    const decoded = decodeAudioPayload(toBase64(encoded), 'mulaw');

    expect(decoded.length).toBe(original.length);
    decoded.forEach((value, i) => {
      // mu-law companding is logarithmic, so absolute error grows with
      // amplitude: ~0.012 at 0.9 full scale. 2% bounds the whole range.
      expect(Math.abs(value - original[i])).toBeLessThan(0.02);
    });
  });

  it('treats an unknown encoding as mulaw rather than throwing', () => {
    const bytes = new Uint8Array([0xff, 0x7f, 0x00]);
    expect(() => decodeAudioPayload(toBase64(bytes), 'something-else')).not.toThrow();
    expect(decodeAudioPayload(toBase64(bytes), 'something-else').length).toBe(3);
  });

  it('returns an empty result for an empty payload', () => {
    expect(decodeAudioPayload('', 'pcm_f32le').length).toBe(0);
    expect(decodeAudioPayload('', 'mulaw').length).toBe(0);
  });
});

describe('mu-law round trip', () => {
  it('preserves sign and rough magnitude across the range', () => {
    for (const v of [-0.9, -0.5, -0.1, 0.1, 0.5, 0.9]) {
      const round = muLawToLinear(linearToMuLaw(v < 0 ? v * 0x8000 : v * 0x7fff));
      expect(Math.sign(round)).toBe(Math.sign(v));
      expect(Math.abs(round - v)).toBeLessThan(0.02);
    }
  });
});

describe('float32ToPCM16', () => {
  it('clamps beyond full scale instead of wrapping', () => {
    const out = float32ToPCM16(new Float32Array([2, -2]), 48000, 48000);
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
  });

  it('decimates by the sample-rate ratio', () => {
    const input = new Float32Array(48);
    const out = float32ToPCM16(input, 48000, 16000);
    expect(out.length).toBe(16);
  });
});
