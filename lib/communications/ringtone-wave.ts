/**
 * A short, gentle two-note WAV ringtone, built locally with no external audio
 * asset or network request. An HTMLAudioElement is used for iOS compatibility.
 */
export function createRingtoneWav(): Blob {
  const sampleRate = 16_000;
  const durationSeconds = 1.6;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const dataLength = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < sampleCount; index++) {
    const time = index / sampleRate;
    const pulse = time % 1.6;
    const start = pulse < 0.34 ? 0 : pulse >= 0.50 && pulse < 0.84 ? 0.50 : -1;
    const elapsed = start >= 0 ? pulse - start : 0;
    const envelope = start < 0
      ? 0
      : Math.min(1, elapsed / 0.025, (0.34 - elapsed) / 0.04);
    const tone = Math.sin(2 * Math.PI * 523.25 * time)
      + 0.7 * Math.sin(2 * Math.PI * 659.25 * time);
    const sample = Math.max(-1, Math.min(1, tone * envelope * 0.18));
    view.setInt16(44 + index * bytesPerSample, Math.round(sample * 32767), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
