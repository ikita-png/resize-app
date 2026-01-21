import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createPublicContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("image.getOptions", () => {
  it("returns available aspect ratios, resolutions, and output formats", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.image.getOptions();

    // Check aspect ratios
    expect(result.aspectRatios).toBeDefined();
    expect(result.aspectRatios).toContain("auto");
    expect(result.aspectRatios).toContain("16:9");
    expect(result.aspectRatios).toContain("1:1");
    expect(result.aspectRatios).toContain("9:16");
    expect(result.aspectRatios.length).toBe(11);

    // Check resolutions
    expect(result.resolutions).toBeDefined();
    expect(result.resolutions).toContain("1K");
    expect(result.resolutions).toContain("2K");
    expect(result.resolutions).toContain("4K");
    expect(result.resolutions.length).toBe(3);

    // Check output formats
    expect(result.outputFormats).toBeDefined();
    expect(result.outputFormats).toContain("jpeg");
    expect(result.outputFormats).toContain("png");
    expect(result.outputFormats).toContain("webp");
    expect(result.outputFormats.length).toBe(3);
  });
});

describe("image.process input validation", () => {

  it("validates minimum image count", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.image.process({
        imageUrls: [],
        aspectRatio: "16:9",
        resolution: "1K",
        outputFormat: "png",
      })
    ).rejects.toThrow();
  });

  it("validates maximum image count (14)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const tooManyImages = Array(15).fill("https://example.com/image.jpg");

    await expect(
      caller.image.process({
        imageUrls: tooManyImages,
        aspectRatio: "16:9",
        resolution: "1K",
        outputFormat: "png",
      })
    ).rejects.toThrow();
  });

  it("validates resolution enum values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.image.process({
        imageUrls: ["https://example.com/image.jpg"],
        aspectRatio: "16:9",
        resolution: "8K" as any,
        outputFormat: "png",
      })
    ).rejects.toThrow();
  });

  it("validates output format enum values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.image.process({
        imageUrls: ["https://example.com/image.jpg"],
        aspectRatio: "16:9",
        resolution: "1K",
        outputFormat: "gif" as any,
      })
    ).rejects.toThrow();
  });
});

describe("image.history", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.image.history({ limit: 20 })).rejects.toThrow();
  });

  it("validates limit range", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Limit too high
    await expect(caller.image.history({ limit: 100 })).rejects.toThrow();

    // Limit too low
    await expect(caller.image.history({ limit: 0 })).rejects.toThrow();
  });
});

describe("nanoBanana utility functions", () => {
  it("validates preset aspect ratios", async () => {
    const { isValidAspectRatio } = await import("./nanoBanana");

    // Valid preset ratios
    expect(isValidAspectRatio("auto")).toBe(true);
    expect(isValidAspectRatio("16:9")).toBe(true);
    expect(isValidAspectRatio("1:1")).toBe(true);
    expect(isValidAspectRatio("9:16")).toBe(true);

    // Valid custom ratios
    expect(isValidAspectRatio("3:2")).toBe(true);
    expect(isValidAspectRatio("16:10")).toBe(true);

    // Invalid ratios
    expect(isValidAspectRatio("invalid")).toBe(false);
    expect(isValidAspectRatio("16-9")).toBe(false);
    expect(isValidAspectRatio("")).toBe(false);
  });

  it("parses aspect ratio strings correctly", async () => {
    const { parseAspectRatio } = await import("./nanoBanana");

    expect(parseAspectRatio("16:9")).toEqual({ width: 16, height: 9 });
    expect(parseAspectRatio("1:1")).toEqual({ width: 1, height: 1 });
    expect(parseAspectRatio("4:3")).toEqual({ width: 4, height: 3 });

    // Invalid formats return null
    expect(parseAspectRatio("invalid")).toBeNull();
    expect(parseAspectRatio("auto")).toBeNull();
  });

  it("generates appropriate resize prompts", async () => {
    const { generateResizePrompt } = await import("./nanoBanana");

    // With custom prompt - should include aspect ratio context
    const customPrompt = generateResizePrompt("16:9", "Make it vintage");
    expect(customPrompt).toContain("Make it vintage");
    expect(customPrompt).toContain("16:9");

    // Without custom prompt (default resize prompt)
    const defaultPrompt = generateResizePrompt("16:9");
    expect(defaultPrompt).toContain("16:9");
    expect(defaultPrompt).toContain("aspect ratio");

    // Auto aspect ratio - should maintain original
    const autoPrompt = generateResizePrompt("auto");
    expect(autoPrompt).toContain("original");
  });
});
