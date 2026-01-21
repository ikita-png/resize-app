/**
 * サーバー側キューシステム
 * fal.ai のレート制限（同時2タスク）を管理し、
 * 複数ユーザーからのリクエストを順番に処理します
 */

import { EventEmitter } from "events";

// キュー内のジョブの状態
export type QueueJobStatus = "queued" | "processing" | "completed" | "failed";

// キュー内のジョブ
export interface QueueJob<T = unknown, R = unknown> {
    id: string;
    data: T;
    status: QueueJobStatus;
    position: number;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    result?: R;
    error?: string;
    resolve: (value: R) => void;
    reject: (error: Error) => void;
}

// キューの設定
interface QueueConfig {
    maxConcurrent: number;  // 同時実行数の上限
    maxQueueSize: number;   // キューの最大サイズ
    jobTimeout: number;     // ジョブのタイムアウト（ミリ秒）
    retryAttempts: number;  // リトライ回数
    retryDelay: number;     // リトライ間隔（ミリ秒）
}

// デフォルト設定
const DEFAULT_CONFIG: QueueConfig = {
    maxConcurrent: 2,      // fal.ai のレート制限に合わせる
    maxQueueSize: 100,     // 最大100件まで待機
    jobTimeout: 300000,    // 5分タイムアウト
    retryAttempts: 3,      // 3回リトライ
    retryDelay: 2000,      // 2秒間隔
};

// ジョブ処理関数の型
type JobProcessor<T, R> = (data: T, attempt: number) => Promise<R>;

/**
 * シンプルなインメモリキューマネージャー
 */
export class QueueManager<T = unknown, R = unknown> extends EventEmitter {
    private queue: QueueJob<T, R>[] = [];
    private processing: Map<string, QueueJob<T, R>> = new Map();
    private config: QueueConfig;
    private processor: JobProcessor<T, R>;
    private jobCounter = 0;
    private isProcessing = false;

    constructor(processor: JobProcessor<T, R>, config: Partial<QueueConfig> = {}) {
        super();
        this.processor = processor;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 新しいジョブをキューに追加
     */
    async enqueue(data: T): Promise<R> {
        // キューサイズチェック
        if (this.queue.length >= this.config.maxQueueSize) {
            throw new Error("キューが満杯です。しばらく待ってから再度お試しください。");
        }

        const jobId = `job-${Date.now()}-${++this.jobCounter}`;

        return new Promise<R>((resolve, reject) => {
            const job: QueueJob<T, R> = {
                id: jobId,
                data,
                status: "queued",
                position: this.queue.length + 1,
                createdAt: new Date(),
                resolve,
                reject,
            };

            this.queue.push(job);
            this.emit("jobAdded", { jobId, position: job.position, queueLength: this.queue.length });

            console.log(`[Queue] ジョブ追加: ${jobId}, 待機位置: ${job.position}, キュー長: ${this.queue.length}`);

            // 処理を開始
            this.processNext();
        });
    }

    /**
     * 次のジョブを処理
     */
    private async processNext(): Promise<void> {
        // 既に処理ループが動いている場合はスキップ
        if (this.isProcessing) return;

        this.isProcessing = true;

        while (this.queue.length > 0 && this.processing.size < this.config.maxConcurrent) {
            const job = this.queue.shift();
            if (!job) break;

            // 位置を更新
            this.updatePositions();

            job.status = "processing";
            job.startedAt = new Date();
            this.processing.set(job.id, job);

            console.log(`[Queue] ジョブ開始: ${job.id}, 同時実行数: ${this.processing.size}/${this.config.maxConcurrent}`);
            this.emit("jobStarted", { jobId: job.id, processingCount: this.processing.size });

            // 非同期で処理を実行（ブロックしない）
            this.executeJob(job);
        }

        this.isProcessing = false;
    }

    /**
     * ジョブを実行（リトライ付き）
     */
    private async executeJob(job: QueueJob<T, R>): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                // タイムアウト付きで処理を実行
                const result = await this.withTimeout(
                    this.processor(job.data, attempt),
                    this.config.jobTimeout
                );

                // 成功
                job.status = "completed";
                job.completedAt = new Date();
                job.result = result;

                this.processing.delete(job.id);
                console.log(`[Queue] ジョブ完了: ${job.id}`);
                this.emit("jobCompleted", { jobId: job.id, result });

                job.resolve(result);

                // 次のジョブを処理
                this.processNext();
                return;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                console.log(`[Queue] ジョブ失敗 (試行 ${attempt}/${this.config.retryAttempts}): ${job.id} - ${lastError.message}`);

                // レート制限エラーの場合は待機時間を延長
                const isRateLimited = lastError.message.includes("429") ||
                    lastError.message.includes("rate") ||
                    lastError.message.includes("limit");

                if (attempt < this.config.retryAttempts) {
                    const delay = isRateLimited
                        ? this.config.retryDelay * attempt * 2  // レート制限時は長めに待機
                        : this.config.retryDelay * attempt;

                    console.log(`[Queue] ${delay}ms 後にリトライ...`);
                    await this.sleep(delay);
                }
            }
        }

        // 全リトライ失敗
        job.status = "failed";
        job.completedAt = new Date();
        job.error = lastError?.message || "不明なエラー";

        this.processing.delete(job.id);
        console.log(`[Queue] ジョブ最終失敗: ${job.id}`);
        this.emit("jobFailed", { jobId: job.id, error: job.error });

        job.reject(lastError || new Error("処理に失敗しました"));

        // 次のジョブを処理
        this.processNext();
    }

    /**
     * タイムアウト付きPromise
     */
    private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error("処理がタイムアウトしました")), ms)
            ),
        ]);
    }

    /**
     * 待機
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * キュー内の位置を更新
     */
    private updatePositions(): void {
        this.queue.forEach((job, index) => {
            job.position = index + 1;
        });
    }

    /**
     * キューの状態を取得
     */
    getStatus(): {
        queueLength: number;
        processingCount: number;
        maxConcurrent: number;
    } {
        return {
            queueLength: this.queue.length,
            processingCount: this.processing.size,
            maxConcurrent: this.config.maxConcurrent,
        };
    }

    /**
     * 特定ジョブの状態を取得
     */
    getJobStatus(jobId: string): {
        status: QueueJobStatus;
        position?: number;
    } | null {
        // 処理中を確認
        const processingJob = this.processing.get(jobId);
        if (processingJob) {
            return { status: "processing" };
        }

        // キュー内を確認
        const queuedJob = this.queue.find(j => j.id === jobId);
        if (queuedJob) {
            return { status: "queued", position: queuedJob.position };
        }

        return null;
    }
}

// グローバルな画像処理キューインスタンス
let imageProcessingQueue: QueueManager | null = null;

/**
 * 画像処理キューを取得または作成
 */
export function getImageProcessingQueue<T, R>(
    processor: JobProcessor<T, R>
): QueueManager<T, R> {
    if (!imageProcessingQueue) {
        imageProcessingQueue = new QueueManager(processor, {
            maxConcurrent: 2,     // fal.ai の制限
            maxQueueSize: 50,     // 最大50件待機
            jobTimeout: 300000,   // 5分
            retryAttempts: 3,     // 3回リトライ
            retryDelay: 3000,     // 3秒間隔
        });

        // ログイベント
        imageProcessingQueue.on("jobAdded", ({ jobId, position, queueLength }) => {
            console.log(`📥 新規ジョブ: ${jobId} (待機位置: ${position}, キュー長: ${queueLength})`);
        });

        imageProcessingQueue.on("jobStarted", ({ jobId, processingCount }) => {
            console.log(`🚀 処理開始: ${jobId} (同時実行: ${processingCount}/2)`);
        });

        imageProcessingQueue.on("jobCompleted", ({ jobId }) => {
            console.log(`✅ 処理完了: ${jobId}`);
        });

        imageProcessingQueue.on("jobFailed", ({ jobId, error }) => {
            console.log(`❌ 処理失敗: ${jobId} - ${error}`);
        });
    }

    return imageProcessingQueue as QueueManager<T, R>;
}

/**
 * キューの状態を取得
 */
export function getQueueStatus(): {
    queueLength: number;
    processingCount: number;
    maxConcurrent: number;
} {
    if (!imageProcessingQueue) {
        return { queueLength: 0, processingCount: 0, maxConcurrent: 2 };
    }
    return imageProcessingQueue.getStatus();
}
