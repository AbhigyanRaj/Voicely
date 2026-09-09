// Mu-law and PCM algorithms

export const linearToMuLaw = (sample: number): number => {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample = (sample + BIAS) >> 0;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  const byte = ~(sign | (exponent << 4) | mantissa);
  return byte & 0xff;
};

export const muLawToLinear = (muLawByte: number): number => {
  muLawByte = ~muLawByte;
  const sign = muLawByte & 0x80 ? -1 : 1;
  const exponent = (muLawByte >> 4) & 0x07;
  const mantissa = muLawByte & 0x0f;
  let sample = ((mantissa << 3) + 132) << exponent;
  sample -= 132;
  return (sign * sample) / 32768.0;
};

export const downsampleAndEncodeMulaw = (
  inputBuffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Uint8Array => {
  const compressionRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputBuffer.length / compressionRatio);
  const outputBuffer = new Uint8Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const inputIndex = Math.round(i * compressionRatio);
    let sample = inputBuffer[inputIndex];
    if (sample < -1) sample = -1;
    if (sample > 1) sample = 1;
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    outputBuffer[i] = linearToMuLaw(intSample);
  }
  return outputBuffer;
};

export const float32ToPCM16 = (
  inputBuffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Int16Array => {
  const compressionRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputBuffer.length / compressionRatio);
  const outputBuffer = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const inputIndex = Math.round(i * compressionRatio);
    let sample = inputBuffer[inputIndex];
    if (sample < -1) sample = -1;
    if (sample > 1) sample = 1;
    outputBuffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return outputBuffer;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Decode one wire payload from the voice pipeline into float samples.
 *
 * Encodings in use:
 *   pcm_f32le  32-bit float LE  -- Cartesia wideband, browser sessions
 *   pcm_s16le  16-bit signed LE -- linear16 providers
 *   mulaw      8-bit G.711      -- telephony
 *
 * @param base64Payload audio as sent over the WebSocket
 * @param encoding      one of the above; anything else is treated as mulaw
 */
export const decodeAudioPayload = (base64Payload: string, encoding: string): Float32Array => {
  const bytes = base64ToUint8Array(base64Payload);

  if (encoding === 'pcm_f32le') {
    // Copy into a fresh buffer: a Uint8Array from atob is not guaranteed to be
    // 4-byte aligned, and Float32Array over a misaligned buffer throws.
    const aligned = new ArrayBuffer(bytes.byteLength - (bytes.byteLength % 4));
    new Uint8Array(aligned).set(bytes.subarray(0, aligned.byteLength));
    return new Float32Array(aligned);
  }

  if (encoding === 'pcm_s16le') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = new Float32Array(bytes.byteLength >> 1);
    for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
    return out;
  }

  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = muLawToLinear(bytes[i]);
  return out;
};
