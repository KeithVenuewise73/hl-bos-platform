// Mock providers for tests and for a walkable demo before any vendor is wired.
//
// They are honest about being mock: `kind` says so, and every image path they
// return is prefixed `mock://`, so a mock result cannot be mistaken for a real
// one by anything downstream — including by a screen rendering it.

import type {
  GenerationResult,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ModerationProvider,
  ModerationVerdict,
} from "../providers.js";

export interface MockImageOptions {
  /** Force an outcome for the nth call (1-based), for failure-path tests. */
  readonly scriptedResults?: readonly Partial<GenerationResult>[];
  /** Characters the fake detector reports. Defaults to what was requested. */
  readonly observedCharacterCount?: number;
}

export class MockImageProvider implements ImageGenerationProvider {
  readonly kind = "mock";
  readonly calls: ImageGenerationRequest[] = [];
  private readonly options: MockImageOptions;

  constructor(options: MockImageOptions = {}) {
    this.options = options;
  }

  generate(request: ImageGenerationRequest): Promise<GenerationResult> {
    this.calls.push(request);
    const scripted = this.options.scriptedResults?.[this.calls.length - 1];
    const providerJobId = `mock-job-${this.calls.length}`;

    const base: GenerationResult = {
      status: "complete",
      providerJobId,
      imagePath: `mock://generated/${providerJobId}.jpg`,
      ...(this.options.observedCharacterCount !== undefined
        ? { observedCharacterCount: this.options.observedCharacterCount }
        : {}),
    };

    return Promise.resolve({ ...base, ...scripted, providerJobId });
  }

  getStatus(providerJobId: string): Promise<GenerationResult> {
    return Promise.resolve({
      status: "complete",
      providerJobId,
      imagePath: `mock://generated/${providerJobId}.jpg`,
    });
  }
}

export interface MockModerationOptions {
  /** Substrings that make moderateText refuse, simulating a real classifier. */
  readonly refuseTextContaining?: readonly string[];
  /** Image paths that moderateImage refuses, for output-rejection tests. */
  readonly refuseImages?: readonly string[];
}

export class MockModerationProvider implements ModerationProvider {
  readonly kind = "mock";
  readonly textCalls: string[] = [];
  readonly imageCalls: string[] = [];
  private readonly options: MockModerationOptions;

  constructor(options: MockModerationOptions = {}) {
    this.options = options;
  }

  moderateText(text: string): Promise<ModerationVerdict> {
    this.textCalls.push(text);
    const hit = (this.options.refuseTextContaining ?? []).find((term) =>
      text.toLowerCase().includes(term.toLowerCase()),
    );
    return Promise.resolve(
      hit === undefined
        ? { allowed: true, categories: [], reason: null }
        : { allowed: false, categories: ["mock_text_category"], reason: hit },
    );
  }

  moderateImage(image: string): Promise<ModerationVerdict> {
    this.imageCalls.push(image);
    const refused = (this.options.refuseImages ?? []).includes(image);
    return Promise.resolve(
      refused
        ? { allowed: false, categories: ["mock_image_category"], reason: image }
        : { allowed: true, categories: [], reason: null },
    );
  }
}
