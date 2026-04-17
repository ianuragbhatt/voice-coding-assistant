import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ModelManager from "../components/ModelManager";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

const notDownloaded = { downloaded: false, size_bytes: null, path: null };

// Simulate macOS platform so EN models appear in the primary (visible) section
function mockMacPlatform() {
  Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
}
function mockWindowsPlatform() {
  Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
}

describe("ModelManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(notDownloaded);
    mockListen.mockResolvedValue(() => {});
    mockMacPlatform(); // default to mac for most tests
  });

  it("renders all 6 model options (3 EN + 3 multilingual)", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      // Primary section always visible
      expect(screen.getByText("Tiny (EN)")).toBeInTheDocument();
      expect(screen.getByText("Base (EN)")).toBeInTheDocument();
      expect(screen.getByText("Small (EN)")).toBeInTheDocument();
    });
    // Secondary section is collapsed by default — expand it
    fireEvent.click(screen.getByText(/multilingual/i));
    await waitFor(() => {
      expect(screen.getByText("Tiny")).toBeInTheDocument();
      expect(screen.getByText("Base")).toBeInTheDocument();
      expect(screen.getByText("Small")).toBeInTheDocument();
    });
  });

  it("shows BEST FOR MAC badge on base.en on macOS", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("BEST FOR MAC")).toBeInTheDocument();
    });
  });

  it("shows EN only and Multilingual language tags", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      const enTags = screen.getAllByText("EN only");
      expect(enTags.length).toBe(3); // tiny.en, base.en, small.en
    });
  });

  it("secondary section is collapsed by default", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => screen.getByText("Base (EN)"));
    // Multilingual models should not be visible yet
    expect(screen.queryByText("Base")).not.toBeInTheDocument();
  });

  it("secondary section expands when toggle is clicked", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => screen.getByText("Base (EN)"));

    const toggle = screen.getByText(/multilingual/i);
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText("Base")).toBeInTheDocument();
    });
  });

  it("calls get_local_model_status for all 6 models on mount", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      const statusCalls = mockInvoke.mock.calls.filter((c) => c[0] === "get_local_model_status");
      expect(statusCalls.length).toBe(6);
    });
  });

  it("shows Download button for non-downloaded models", async () => {
    mockInvoke.mockResolvedValue(notDownloaded);
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      // Primary section has 3 models, all not downloaded → 3 Download buttons
      expect(screen.getAllByText("Download").length).toBe(3);
    });
  });

  it("calls download_local_model with correct model id", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_local_model_status") return Promise.resolve(notDownloaded);
      if (cmd === "download_local_model") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => screen.getAllByText("Download"));

    // Click Download on the first visible model (tiny.en)
    fireEvent.click(screen.getAllByText("Download")[0]);

    await waitFor(() => {
      const calls = mockInvoke.mock.calls.filter((c) => c[0] === "download_local_model");
      expect(calls.length).toBe(1);
      expect((calls[0][1] as any).modelId).toBe("tiny.en");
    });
  });

  it("calls onSelectModel when a model card is clicked", async () => {
    const onSelectModel = vi.fn();
    render(<ModelManager selectedModel="base.en" onSelectModel={onSelectModel} />);
    await waitFor(() => screen.getByText("Tiny (EN)"));

    // Click the Tiny (EN) card — find the outer motion div
    const tinyLabel = screen.getByText("Tiny (EN)");
    const card = tinyLabel.closest(".rounded-lg")!;
    fireEvent.click(card);

    expect(onSelectModel).toHaveBeenCalledWith("tiny.en");
  });

  it("subscribes to model-download-progress event", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      expect(mockListen.mock.calls.some((c) => c[0] === "model-download-progress")).toBe(true);
    });
  });

  it("shows Metal acceleration note in footer on macOS", async () => {
    render(<ModelManager selectedModel="base.en" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Metal GPU acceleration/i)).toBeInTheDocument();
    });
  });

  it("on Windows, multilingual models appear in primary section", async () => {
    mockWindowsPlatform();
    render(<ModelManager selectedModel="base" onSelectModel={vi.fn()} />);
    // Multilingual "Base" should be visible without expanding secondary section
    await waitFor(() => {
      expect(screen.getByText("Base")).toBeInTheDocument();
    });
    // BEST FOR MAC badge should NOT appear on Windows
    expect(screen.queryByText("BEST FOR MAC")).not.toBeInTheDocument();
  });

  it("on Windows, shows CUDA note in footer", async () => {
    mockWindowsPlatform();
    render(<ModelManager selectedModel="base" onSelectModel={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/CUDA acceleration/i)).toBeInTheDocument();
    });
  });
});
