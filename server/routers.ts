import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createImageJob,
  updateImageJobStatus,
  createImageFiles,
  getUserJobsWithFiles,
  getJobWithFiles,
} from "./db";
import {
  processImages,
  generateResizePrompt,
  isValidAspectRatio,
  ASPECT_RATIOS,
  RESOLUTIONS,
  OUTPUT_FORMATS,
} from "./nanoBanana";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { getImageProcessingQueue, getQueueStatus } from "./queue";
import { ENV } from "./_core/env";
import { SignJWT } from "jose";
import {
  canAttemptLogin,
  recordLoginFailure,
  recordLoginSuccess,
  canProcess,
  recordProcessing,
  getRemainingProcessingCount,
  isSessionValid,
  SECURITY_CONFIG,
} from "./security";

async function verifyRecaptcha(token: string): Promise<boolean> {
  const secretKey = ENV.recaptchaSecretKey;
  if (!secretKey) return true; // Skip if no secret key configured

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${secretKey}&response=${token}`,
    });
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('reCAPTCHA verification failed:', error);
    return false;
  }
}

// Session cookie name for password auth
const AUTH_COOKIE_NAME = "resize_auth";

// Zod schemas for validation
const aspectRatioSchema = z.enum(ASPECT_RATIOS).or(z.string().regex(/^\d+:\d+$/));
const resolutionSchema = z.enum(RESOLUTIONS);
const outputFormatSchema = z.enum(OUTPUT_FORMATS);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Check if password authentication is required
    isPasswordRequired: publicProcedure.query(() => {
      return { required: ENV.accessPassword.length > 0 };
    }),

    // Check if user is authenticated with password
    checkAuth: publicProcedure.query(({ ctx }) => {
      const authCookie = ctx.req.cookies?.[AUTH_COOKIE_NAME];
      if (!authCookie) {
        return { authenticated: false };
      }

      // Check session timeout
      if (!isSessionValid(authCookie)) {
        return { authenticated: false, reason: "セッションがタイムアウトしました" };
      }

      // Simple validation - check if cookie exists and matches expected format
      try {
        const decoded = Buffer.from(authCookie, 'base64').toString();
        const isValid = decoded.startsWith('authenticated:');
        return { authenticated: isValid };
      } catch {
        return { authenticated: false };
      }
    }),

    // Get remaining processing limits
    getLimits: publicProcedure.query(({ ctx }) => {
      const authCookie = ctx.req.cookies?.[AUTH_COOKIE_NAME] || "anonymous";
      return getRemainingProcessingCount(authCookie);
    }),

    // Login with password
    loginWithPassword: publicProcedure
      .input(z.object({
        password: z.string(),
        recaptchaToken: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        // Get client IP
        const ip = ctx.req.ip || ctx.req.headers['x-forwarded-for']?.toString() || 'unknown';

        // Check if login attempts are allowed
        const attemptCheck = canAttemptLogin(ip);
        let isRecaptchaVerified = false;

        // If reCAPTCHA token is provided, verify it first
        if (input.recaptchaToken) {
          isRecaptchaVerified = await verifyRecaptcha(input.recaptchaToken);
          if (!isRecaptchaVerified) {
            throw new Error("ロボット検証に失敗しました。もう一度お試しください。");
          }
        }

        // Enforce lock only if reCAPTCHA is NOT verified
        // This allows humans to bypass the IP lock by solving the CAPTCHA
        if (!attemptCheck.allowed && !isRecaptchaVerified) {
          const lockedUntil = attemptCheck.lockedUntil;
          const remainingMinutes = lockedUntil
            ? Math.ceil((lockedUntil.getTime() - Date.now()) / 60000)
            : 15;
          throw new Error(`ログイン試行回数が上限に達しました。${remainingMinutes}分後に再試行するか、「ロボットではありません」にチェックを入れてください。`);
        }

        // Check if password is configured
        if (!ENV.accessPassword) {
          throw new Error("パスワード認証が設定されていません");
        }

        // Verify password
        if (input.password !== ENV.accessPassword) {
          // Record failed attempt
          const result = recordLoginFailure(ip);
          const remaining = attemptCheck.remainingAttempts ? attemptCheck.remainingAttempts - 1 : 0;

          if (result.locked) {
            throw new Error(`パスワードが正しくありません。ログインが15分間ロックされました。`);
          }
          throw new Error(`パスワードが正しくありません（残り${remaining}回）`);
        }

        // Record successful login
        recordLoginSuccess(ip);

        // Create auth token
        const authToken = Buffer.from(`authenticated:${Date.now()}`).toString('base64');

        // Set cookie with session timeout
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(AUTH_COOKIE_NAME, authToken, {
          ...cookieOptions,
          maxAge: SECURITY_CONFIG.session.timeoutMs,
        });

        return { success: true };
      }),
  }),

  image: router({
    // Get available options for the UI
    getOptions: publicProcedure.query(() => ({
      aspectRatios: ASPECT_RATIOS,
      resolutions: RESOLUTIONS,
      outputFormats: OUTPUT_FORMATS,
    })),

    // Get queue status
    queueStatus: publicProcedure.query(() => getQueueStatus()),

    // Download image proxy to avoid CORS issues
    download: publicProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const response = await fetch(input.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          const contentType = response.headers.get("content-type") || "image/png";
          return {
            data: `data:${contentType};base64,${base64}`,
            contentType,
          };
        } catch (error) {
          throw new Error("Failed to download image");
        }
      }),

    // Process images with Nano Banana Pro
    process: publicProcedure
      .input(
        z.object({
          imageUrls: z.array(z.string()).min(1).max(14),
          prompt: z.string().optional(),
          aspectRatio: aspectRatioSchema.default("auto"),
          resolution: resolutionSchema.default("1K"),
          outputFormat: outputFormatSchema.default("png"),
          numImages: z.number().min(1).max(4).default(1),
          notifyOnComplete: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Use anonymous user ID if not authenticated
        const userId = ctx.user?.id || 0;

        // Get session ID for rate limiting
        const sessionId = ctx.req.cookies?.[AUTH_COOKIE_NAME] || ctx.req.ip || "anonymous";

        // Check processing limits
        const totalImages = input.imageUrls.length * input.numImages;
        const limitCheck = canProcess(sessionId, totalImages);
        if (!limitCheck.allowed) {
          throw new Error(limitCheck.reason || "処理制限に達しました");
        }

        // Validate aspect ratio
        if (!isValidAspectRatio(input.aspectRatio)) {
          throw new Error(`Invalid aspect ratio: ${input.aspectRatio}`);
        }

        // Upload data URLs to S3 first to get proper URLs for the API
        const uploadedImageUrls = await Promise.all(
          input.imageUrls.map(async (dataUrl, index) => {
            // Check if it's a data URL
            if (dataUrl.startsWith("data:")) {
              // Extract mime type and base64 data
              const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (!matches) {
                throw new Error(`Invalid data URL format for image ${index + 1}`);
              }
              const mimeType = matches[1];
              const base64Data = matches[2];
              const buffer = Buffer.from(base64Data, "base64");

              // Determine file extension from mime type
              const extMap: Record<string, string> = {
                "image/jpeg": "jpg",
                "image/jpg": "jpg",
                "image/png": "png",
                "image/webp": "webp",
                "image/gif": "gif",
              };
              const ext = extMap[mimeType] || "png";

              // Upload to S3
              const fileKey = `uploads/${userId}/${nanoid()}.${ext}`;
              const { url } = await storagePut(fileKey, buffer, mimeType);
              return url;
            }
            // If it's already a URL, return as is
            return dataUrl;
          })
        );

        // Create job record
        const jobId = await createImageJob({
          userId,
          status: "pending",
          prompt: input.prompt || null,
          aspectRatio: input.aspectRatio,
          resolution: input.resolution,
          outputFormat: input.outputFormat,
          imageCount: uploadedImageUrls.length,
          notifyOnComplete: input.notifyOnComplete ? 1 : 0,
        });

        // Store original images
        await createImageFiles(
          uploadedImageUrls.map((url, index) => ({
            jobId,
            type: "original" as const,
            url,
            fileName: `original-${index + 1}`,
          }))
        );

        try {
          // Update status to processing
          await updateImageJobStatus(jobId, "processing");

          // Generate prompt for resizing
          const effectivePrompt = generateResizePrompt(
            input.aspectRatio as any,
            input.prompt
          );

          // Get the queue and define the processor
          const queue = getImageProcessingQueue(async (data: {
            prompt: string;
            imageUrls: string[];
            aspectRatio: string;
            resolution: string;
            outputFormat: string;
            numImages: number;
          }) => {
            return processImages({
              prompt: data.prompt,
              imageUrls: data.imageUrls,
              aspectRatio: data.aspectRatio as any,
              resolution: data.resolution as "1K" | "2K" | "4K",
              outputFormat: data.outputFormat as "jpeg" | "png" | "webp",
              numImages: data.numImages,
            });
          });

          // Enqueue the job (will wait if queue is full)
          const result = await queue.enqueue({
            prompt: effectivePrompt,
            imageUrls: uploadedImageUrls,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
            numImages: input.numImages,
          });

          // Store processed images
          const processedFiles = await Promise.all(
            result.images.map(async (img, index) => {
              // Instead of uploading to storage, use the fal.ai URL directly
              // This avoids needing BUILT_IN_FORGE_API keys

              return {
                jobId,
                type: "processed" as const,
                url: img.url,
                fileKey: `processed/${userId}/${jobId}/${index + 1}.${input.outputFormat}`,
                fileName: img.fileName || `processed-${index + 1}.${input.outputFormat}`,
                mimeType: img.contentType || `image/${input.outputFormat}`,
                width: img.width,
                height: img.height,
              };
            })
          );

          await createImageFiles(processedFiles);

          // Update job status to completed
          await updateImageJobStatus(jobId, "completed");

          // Record processing for rate limiting
          recordProcessing(sessionId, result.images.length);

          // Send notification if requested
          if (input.notifyOnComplete) {
            await notifyOwner({
              title: "Image Processing Complete",
              content: `Job #${jobId} has been completed. ${result.images.length} image(s) processed successfully.`,
            });
          }

          return {
            jobId,
            images: processedFiles.map((f) => ({
              url: f.url,
              width: f.width,
              height: f.height,
            })),
            description: result.description,
          };
        } catch (error) {
          // Update job status to failed
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          await updateImageJobStatus(jobId, "failed", errorMessage);

          throw error;
        }
      }),

    // Get processing history
    history: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(50).default(20),
        })
      )
      .query(async ({ ctx, input }) => {
        const results = await getUserJobsWithFiles(ctx.user.id, input.limit);
        return results.map(({ job, files }) => ({
          id: job.id,
          status: job.status,
          prompt: job.prompt,
          aspectRatio: job.aspectRatio,
          resolution: job.resolution,
          outputFormat: job.outputFormat,
          imageCount: job.imageCount,
          errorMessage: job.errorMessage,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          originalImages: files.filter((f) => f.type === "original"),
          processedImages: files.filter((f) => f.type === "processed"),
        }));
      }),

    // Get single job details
    getJob: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const result = await getJobWithFiles(input.jobId);
        if (!result) {
          throw new Error("Job not found");
        }
        if (result.job.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return {
          ...result.job,
          originalImages: result.files.filter((f) => f.type === "original"),
          processedImages: result.files.filter((f) => f.type === "processed"),
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
