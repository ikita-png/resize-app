import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, imageJobs, imageFiles, InsertImageJob, InsertImageFile, ImageJob, ImageFile } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Image Job Queries ====================

export async function createImageJob(job: InsertImageJob): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(imageJobs).values(job);
  return result[0].insertId;
}

export async function updateImageJobStatus(
  jobId: number,
  status: "pending" | "processing" | "completed" | "failed",
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Partial<ImageJob> = { status };
  if (status === "completed") {
    updateData.completedAt = new Date();
  }
  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  await db.update(imageJobs).set(updateData).where(eq(imageJobs.id, jobId));
}

export async function getImageJobById(jobId: number): Promise<ImageJob | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(imageJobs).where(eq(imageJobs.id, jobId)).limit(1);
  return result[0];
}

export async function getUserImageJobs(userId: number, limit = 20): Promise<ImageJob[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(imageJobs)
    .where(eq(imageJobs.userId, userId))
    .orderBy(desc(imageJobs.createdAt))
    .limit(limit);
}

// ==================== Image File Queries ====================

export async function createImageFile(file: InsertImageFile): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(imageFiles).values(file);
  return result[0].insertId;
}

export async function createImageFiles(files: InsertImageFile[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (files.length > 0) {
    await db.insert(imageFiles).values(files);
  }
}

export async function getImageFilesByJobId(jobId: number): Promise<ImageFile[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(imageFiles).where(eq(imageFiles.jobId, jobId));
}

export async function getJobWithFiles(jobId: number): Promise<{ job: ImageJob; files: ImageFile[] } | null> {
  const job = await getImageJobById(jobId);
  if (!job) return null;

  const files = await getImageFilesByJobId(jobId);
  return { job, files };
}

export async function getUserJobsWithFiles(userId: number, limit = 20): Promise<Array<{ job: ImageJob; files: ImageFile[] }>> {
  const jobs = await getUserImageJobs(userId, limit);
  
  const results = await Promise.all(
    jobs.map(async (job) => {
      const files = await getImageFilesByJobId(job.id);
      return { job, files };
    })
  );

  return results;
}
