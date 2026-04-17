import { describe, it, expect } from "vitest";
import { float32ToWav } from "../hooks/useAudioRecorder";

// ─────────────────────────────────────────────────────────────────────────────
// float32ToWav — WAV encoding tests
// These run in jsdom (no real audio context needed) and verify the WAV header
// and PCM data encoding that is critical for both local whisper and API modes.
// ─────────────────────────────────────────────────────────────────────────────

describe("float32ToWav", () => {
  it("produces a Blob with audio/wav type", () => {
    const samples = new Float32Array(100);
    const blob = float32ToWav(samples, 16000);
    expect(blob.type).toBe("audio/wav");
  });

  it("has correct total byte length (44-byte header + 2*numSamples)", () => {
    const numSamples = 200;
    const samples = new Float32Array(numSamples);
    const blob = float32ToWav(samples, 16000);
    expect(blob.size).toBe(44 + numSamples * 2);
  });

  it("writes correct RIFF header", async () => {
    const samples = new Float32Array(100);
    const blob = float32ToWav(samples, 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);

    // "RIFF"
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    // "WAVE"
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe("WAVE");
    // "fmt "
    expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))).toBe("fmt ");
    // "data"
    expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))).toBe("data");
  });

  it("writes correct PCM format fields", async () => {
    const samples = new Float32Array(100);
    const sampleRate = 16000;
    const blob = float32ToWav(samples, sampleRate);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);

    expect(view.getUint16(20, true)).toBe(1);       // PCM format = 1
    expect(view.getUint16(22, true)).toBe(1);       // mono = 1
    expect(view.getUint32(24, true)).toBe(sampleRate); // sample rate
    expect(view.getUint16(34, true)).toBe(16);      // bits per sample = 16
  });

  it("encodes silence (0.0 samples) as 0 int16 values", async () => {
    const samples = new Float32Array(4).fill(0);
    const blob = float32ToWav(samples, 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);

    for (let i = 0; i < 4; i++) {
      expect(view.getInt16(44 + i * 2, true)).toBe(0);
    }
  });

  it("encodes +1.0 as max positive int16 (0x7FFF)", async () => {
    const samples = new Float32Array([1.0]);
    const blob = float32ToWav(samples, 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(0x7fff);
  });

  it("encodes -1.0 as min negative int16 (-0x8000)", async () => {
    const samples = new Float32Array([-1.0]);
    const blob = float32ToWav(samples, 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(-0x8000);
  });

  it("clamps values outside [-1, 1]", async () => {
    const samples = new Float32Array([2.0, -2.0]);
    const blob = float32ToWav(samples, 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(0x7fff);    // clamped to +1
    expect(view.getInt16(46, true)).toBe(-0x8000);   // clamped to -1
  });

  it("handles empty samples without error", () => {
    const samples = new Float32Array(0);
    expect(() => float32ToWav(samples, 16000)).not.toThrow();
    const blob = float32ToWav(samples, 16000);
    expect(blob.size).toBe(44); // header only
  });

  it("works at different sample rates (44100 Hz)", async () => {
    const samples = new Float32Array(10);
    const blob = float32ToWav(samples, 44100);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    expect(view.getUint32(24, true)).toBe(44100);
  });
});
