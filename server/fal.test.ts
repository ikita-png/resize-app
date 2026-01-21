import { describe, expect, it } from "vitest";

describe("fal.ai API Key Validation", () => {
  it("should have FAL_KEY environment variable set", () => {
    const falKey = process.env.FAL_KEY;
    expect(falKey).toBeDefined();
    expect(falKey).not.toBe("");
    expect(typeof falKey).toBe("string");
  });

  it("should be able to initialize fal client with credentials", async () => {
    const { fal } = await import("@fal-ai/client");
    
    // Configure fal client with the API key
    fal.config({
      credentials: process.env.FAL_KEY,
    });

    // Verify the client is configured (no error thrown)
    expect(fal).toBeDefined();
  });
});
