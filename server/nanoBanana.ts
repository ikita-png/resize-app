import { fal } from "@fal-ai/client";

// Configure fal client with API key
const falKey = process.env.FAL_KEY;
if (!falKey) {
  console.warn("[Nano Banana] FAL_KEY environment variable is not set");
}

fal.config({
  credentials: falKey,
});

// Aspect ratio options supported by Nano Banana Pro
export const ASPECT_RATIOS = [
  "auto",
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "2:3",
  "9:16",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

// Resolution options
export const RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

// Output format options
export const OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

// Input for image processing
export interface ProcessImageInput {
  prompt: string;
  imageUrls: string[];
  aspectRatio?: AspectRatio | string;
  resolution?: Resolution;
  outputFormat?: OutputFormat;
  numImages?: number;
}

// Output from image processing
export interface ProcessedImage {
  url: string;
  contentType?: string;
  fileName?: string;
  width?: number;
  height?: number;
}

export interface ProcessImageResult {
  images: ProcessedImage[];
  description: string;
}

/**
 * Process images using Nano Banana Pro API
 * Supports image editing, resizing, and AI-powered transformations
 */
export async function processImages(input: ProcessImageInput): Promise<ProcessImageResult> {
  const {
    prompt,
    imageUrls,
    aspectRatio = "auto",
    resolution = "1K",
    outputFormat = "png",
    numImages = 1,
  } = input;

  if (!imageUrls || imageUrls.length === 0) {
    throw new Error("At least one image URL is required");
  }

  if (imageUrls.length > 14) {
    throw new Error("Maximum 14 images can be processed at once");
  }

  // Determine if aspectRatio is a preset or custom
  const isPresetRatio = ASPECT_RATIOS.includes(aspectRatio as AspectRatio);
  const effectiveAspectRatio = isPresetRatio ? aspectRatio : "auto";

  console.log("[Nano Banana] Starting processing with:", {
    prompt: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
    imageCount: imageUrls.length,
    imageUrlSamples: imageUrls.slice(0, 2).map(url => url.substring(0, 80) + "..."),
    aspectRatio: effectiveAspectRatio,
    resolution,
    outputFormat,
    numImages,
  });

  try {
    const result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
      input: {
        prompt,
        image_urls: imageUrls,
        aspect_ratio: effectiveAspectRatio as AspectRatio,
        resolution,
        output_format: outputFormat,
        num_images: numImages,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          const logMessages = update.logs?.map((log) => log.message).join(", ");
          console.log("[Nano Banana] Processing:", logMessages || "in progress...");
        } else if (update.status === "IN_QUEUE") {
          console.log("[Nano Banana] Queued, waiting for processing...");
        }
      },
    });

    console.log("[Nano Banana] API call completed successfully");

    const data = result.data as {
      images: Array<{
        url: string;
        content_type?: string;
        file_name?: string;
        width?: number;
        height?: number;
      }>;
      description?: string;
    };

    if (!data.images || data.images.length === 0) {
      console.error("[Nano Banana] No images in response:", JSON.stringify(result.data));
      throw new Error("No images returned from API");
    }

    console.log("[Nano Banana] Successfully processed", data.images.length, "images");

    return {
      images: data.images.map((img) => ({
        url: img.url,
        contentType: img.content_type,
        fileName: img.file_name,
        width: img.width,
        height: img.height,
      })),
      description: data.description || "",
    };
  } catch (error: any) {
    console.error("[Nano Banana] Error processing images:", {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      body: error?.body,
    });
    
    // Provide more specific error messages
    if (error?.message?.includes("Forbidden") || error?.status === 403) {
      throw new Error("API access denied. The fal.ai API key may be invalid or expired. Please check your FAL_KEY.");
    }
    if (error?.message?.includes("Unauthorized") || error?.status === 401) {
      throw new Error("API authentication failed. Please verify your FAL_KEY is correct.");
    }
    if (error?.message?.includes("rate limit") || error?.status === 429) {
      throw new Error("API rate limit exceeded. Please try again later.");
    }
    
    throw error;
  }
}

/**
 * Generate a resize prompt based on aspect ratio and custom input
 */
export function generateResizePrompt(aspectRatio: AspectRatio | string, customPrompt?: string): string {
  // If user provided a custom prompt, use it with aspect ratio context
  if (customPrompt && customPrompt.trim()) {
    // Add aspect ratio context to custom prompt for better results
    if (aspectRatio !== "auto") {
      return `${customPrompt}. Resize the output to ${aspectRatio} aspect ratio.`;
    }
    return customPrompt;
  }

  // Default prompt for resizing - more specific instructions
  if (aspectRatio === "auto") {
    return "Recreate this image with the same content, maintaining the original aspect ratio and quality. Keep all elements exactly as they are.";
  }

  // Specific aspect ratio prompt
  return `Resize and crop this image to ${aspectRatio} aspect ratio. Maintain the main subject and important elements in the frame. Keep the same style, colors, and quality as the original.`;
}

/**
 * Validate aspect ratio string (including custom ratios like "3:2")
 */
export function isValidAspectRatio(ratio: string): boolean {
  if (ASPECT_RATIOS.includes(ratio as AspectRatio)) {
    return true;
  }
  
  // Check for custom ratio format (e.g., "3:2", "16:10")
  const customRatioPattern = /^\d+:\d+$/;
  return customRatioPattern.test(ratio);
}

/**
 * Parse custom aspect ratio to get width and height values
 */
export function parseAspectRatio(ratio: string): { width: number; height: number } | null {
  const match = ratio.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  };
}
