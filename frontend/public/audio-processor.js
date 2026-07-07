class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Use a small buffer to accumulate samples before sending to main thread
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  linearToMuLaw(sample) {
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
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];
        
        if (this.bufferIndex >= this.bufferSize) {
          // Process full buffer to mulaw
          const outputBuffer = new Uint8Array(this.bufferSize);
          for (let j = 0; j < this.bufferSize; j++) {
            let sample = this.buffer[j];
            if (sample < -1) sample = -1;
            if (sample > 1) sample = 1;
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            outputBuffer[j] = this.linearToMuLaw(intSample);
          }
          
          // Send to main thread
          this.port.postMessage(outputBuffer);
          
          this.bufferIndex = 0;
        }
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
