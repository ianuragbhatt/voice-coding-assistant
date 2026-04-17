import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useLocalTranscription } from "../hooks/useLocalTranscription";
import { float32ToWav } from "../hooks/useAudioRecorder";

const mockInvoke = vi.mocked(invoke);

describe("useLocalTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with isTranscribing=false and error=null", () => {
    const { result } = renderHook(() => useLocalTranscription());
    expect(result.current.isTranscribing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("calls invoke('transcribe_local') with correct args", async () => {
    mockInvoke.mockResolvedValueOnce("hello world");

    const { result } = renderHook(() => useLocalTranscription());
    const blob = float32ToWav(new Float32Array(100).fill(0), 16000);

    let text: string = "";
    await act(async () => {
      text = await result.current.transcribe(blob, "base");
    });

    expect(mockInvoke).toHaveBeenCalledWith("transcribe_local", {
      audioWav: expect.any(Array),
      modelId: "base",
    });
    expect(text).toBe("hello world");
  });

  it("audioWav is a plain number array (not Uint8Array) for Tauri IPC", async () => {
    mockInvoke.mockResolvedValueOnce("test");

    const { result } = renderHook(() => useLocalTranscription());
    const blob = float32ToWav(new Float32Array(10), 16000);

    await act(async () => {
      await result.current.transcribe(blob, "tiny");
    });

    const callArgs = mockInvoke.mock.calls[0][1] as any;
    expect(Array.isArray(callArgs.audioWav)).toBe(true);
    // Each element must be a number (0-255)
    for (const byte of callArgs.audioWav) {
      expect(typeof byte).toBe("number");
      expect(byte).toBeGreaterThanOrEqual(0);
      expect(byte).toBeLessThanOrEqual(255);
    }
  });

  it("sets error and re-throws when invoke rejects", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Model not downloaded"));

    const { result } = renderHook(() => useLocalTranscription());
    const blob = float32ToWav(new Float32Array(100), 16000);

    await act(async () => {
      await expect(result.current.transcribe(blob, "base")).rejects.toThrow("Model not downloaded");
    });

    expect(result.current.error).toBe("Model not downloaded");
    expect(result.current.isTranscribing).toBe(false);
  });

  it("resets isTranscribing to false after success", async () => {
    mockInvoke.mockResolvedValueOnce("done");

    const { result } = renderHook(() => useLocalTranscription());
    const blob = float32ToWav(new Float32Array(50), 16000);

    await act(async () => {
      await result.current.transcribe(blob, "base");
    });

    expect(result.current.isTranscribing).toBe(false);
  });

  it("resets isTranscribing to false after failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("oops"));

    const { result } = renderHook(() => useLocalTranscription());
    const blob = float32ToWav(new Float32Array(50), 16000);

    await act(async () => {
      await result.current.transcribe(blob, "base").catch(() => {});
    });

    expect(result.current.isTranscribing).toBe(false);
  });

  it("passes different model IDs correctly", async () => {
    mockInvoke.mockResolvedValue("text");

    const { result } = renderHook(() => useLocalTranscription());
    const blob = float32ToWav(new Float32Array(10), 16000);

    for (const modelId of ["tiny", "base", "small"]) {
      await act(async () => {
        await result.current.transcribe(blob, modelId);
      });
      const lastCall = mockInvoke.mock.calls[mockInvoke.mock.calls.length - 1];
      expect((lastCall[1] as any).modelId).toBe(modelId);
    }
  });
});
