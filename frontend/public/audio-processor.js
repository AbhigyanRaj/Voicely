/**
 * Mic tap for the Voice Sandbox.
 *
 * Emits signed 16-bit PCM at the AudioContext's own sample rate, in ~20ms
 * frames -- the same cadence Twilio's media streams use.
 *
 * This used to accumulate 2048 samples and mu-law encode them. Against the 8kHz
 * context the sandbox pinned, 2048 samples is 256ms of audio held before a
 * single byte left the browser: the largest fixed delay anywhere in the turn,
 * and roughly four frames per second.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // ~20ms of audio, rounded to whole render quanta (128 frames each) so the
    // buffer fills exactly rather than straddling a quantum boundary.
    const targetFrames = Math.round(sampleRate * 0.02);
    const quanta = Math.max(1, Math.round(targetFrames / 128));
    this.bufferSize = quanta * 128;

    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;

    this.port.postMessage({ type: 'ready', sampleRate, frameSize: this.bufferSize });
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData) return true;

    for (let i = 0; i < channelData.length; i++) {
      let sample = channelData[i];
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      // Asymmetric scaling: int16 holds -32768..32767.
      this.buffer[this.bufferIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      if (this.bufferIndex >= this.bufferSize) {
        // Copy, because the transfer hands ownership away and we keep reusing
        // this.buffer for the next frame.
        const frame = this.buffer.slice();
        this.port.postMessage({ type: 'audio', buffer: frame.buffer, capturedAt: currentTime }, [
          frame.buffer,
        ]);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
