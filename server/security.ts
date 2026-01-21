/**
 * セキュリティ機能モジュール
 * - ログイン試行回数制限
 * - ユーザー別処理回数制限
 * - セッションタイムアウト管理
 */

// =============================================
// 設定
// =============================================

export const SECURITY_CONFIG = {
    // ログイン試行制限
    login: {
        maxAttempts: 5,           // 最大試行回数
        lockoutDurationMs: 15 * 60 * 1000,  // ロック時間（15分）
        attemptWindowMs: 15 * 60 * 1000,    // 試行回数カウントウィンドウ（15分）
    },

    // ユーザー別処理制限
    processing: {
        maxPerDay: 100,           // 1日あたりの最大処理枚数
        maxPerHour: 30,           // 1時間あたりの最大処理枚数
    },

    // セッション
    session: {
        timeoutMs: 24 * 60 * 60 * 1000,  // セッションタイムアウト（24時間）
    },
};

// =============================================
// ログイン試行回数制限
// =============================================

interface LoginAttempt {
    count: number;
    firstAttemptAt: number;
    lockedUntil: number | null;
}

// IPアドレスごとのログイン試行を記録
const loginAttempts = new Map<string, LoginAttempt>();

/**
 * ログイン試行が許可されているかチェック
 */
export function canAttemptLogin(ip: string): { allowed: boolean; remainingAttempts?: number; lockedUntil?: Date } {
    const now = Date.now();
    const attempt = loginAttempts.get(ip);

    // 記録なし → 許可
    if (!attempt) {
        return { allowed: true, remainingAttempts: SECURITY_CONFIG.login.maxAttempts };
    }

    // ロック中かチェック
    if (attempt.lockedUntil && now < attempt.lockedUntil) {
        return {
            allowed: false,
            lockedUntil: new Date(attempt.lockedUntil)
        };
    }

    // ロック期間終了 → リセット
    if (attempt.lockedUntil && now >= attempt.lockedUntil) {
        loginAttempts.delete(ip);
        return { allowed: true, remainingAttempts: SECURITY_CONFIG.login.maxAttempts };
    }

    // ウィンドウ期間外 → リセット
    if (now - attempt.firstAttemptAt > SECURITY_CONFIG.login.attemptWindowMs) {
        loginAttempts.delete(ip);
        return { allowed: true, remainingAttempts: SECURITY_CONFIG.login.maxAttempts };
    }

    // 残り試行回数をチェック
    const remaining = SECURITY_CONFIG.login.maxAttempts - attempt.count;
    return { allowed: remaining > 0, remainingAttempts: Math.max(0, remaining) };
}

/**
 * ログイン失敗を記録
 */
export function recordLoginFailure(ip: string): { locked: boolean; lockedUntil?: Date } {
    const now = Date.now();
    const attempt = loginAttempts.get(ip);

    if (!attempt || now - attempt.firstAttemptAt > SECURITY_CONFIG.login.attemptWindowMs) {
        // 新規または期間外 → 新しく記録開始
        loginAttempts.set(ip, {
            count: 1,
            firstAttemptAt: now,
            lockedUntil: null,
        });
        return { locked: false };
    }

    // カウント増加
    attempt.count++;

    // 上限に達したらロック
    if (attempt.count >= SECURITY_CONFIG.login.maxAttempts) {
        attempt.lockedUntil = now + SECURITY_CONFIG.login.lockoutDurationMs;
        loginAttempts.set(ip, attempt);
        console.log(`[Security] IP ${ip} がログイン試行上限に達しました。${new Date(attempt.lockedUntil).toISOString()} までロック`);
        return { locked: true, lockedUntil: new Date(attempt.lockedUntil) };
    }

    loginAttempts.set(ip, attempt);
    return { locked: false };
}

/**
 * ログイン成功時にリセット
 */
export function recordLoginSuccess(ip: string): void {
    loginAttempts.delete(ip);
}

// =============================================
// ユーザー別処理回数制限
// =============================================

interface ProcessingRecord {
    hourly: { count: number; startedAt: number };
    daily: { count: number; startedAt: number };
}

// セッションIDごとの処理回数を記録
const processingRecords = new Map<string, ProcessingRecord>();

/**
 * 処理が許可されているかチェック
 */
export function canProcess(sessionId: string, imageCount: number = 1): {
    allowed: boolean;
    reason?: string;
    hourlyRemaining?: number;
    dailyRemaining?: number;
} {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    let record = processingRecords.get(sessionId);

    // 記録なし → 新規作成
    if (!record) {
        record = {
            hourly: { count: 0, startedAt: now },
            daily: { count: 0, startedAt: now },
        };
        processingRecords.set(sessionId, record);
    }

    // 時間ウィンドウのリセット
    if (now - record.hourly.startedAt > oneHour) {
        record.hourly = { count: 0, startedAt: now };
    }
    if (now - record.daily.startedAt > oneDay) {
        record.daily = { count: 0, startedAt: now };
    }

    const hourlyRemaining = SECURITY_CONFIG.processing.maxPerHour - record.hourly.count;
    const dailyRemaining = SECURITY_CONFIG.processing.maxPerDay - record.daily.count;

    // 時間制限チェック
    if (record.hourly.count + imageCount > SECURITY_CONFIG.processing.maxPerHour) {
        return {
            allowed: false,
            reason: `1時間あたりの処理上限（${SECURITY_CONFIG.processing.maxPerHour}枚）に達しました`,
            hourlyRemaining: Math.max(0, hourlyRemaining),
            dailyRemaining: Math.max(0, dailyRemaining),
        };
    }

    // 日次制限チェック
    if (record.daily.count + imageCount > SECURITY_CONFIG.processing.maxPerDay) {
        return {
            allowed: false,
            reason: `1日あたりの処理上限（${SECURITY_CONFIG.processing.maxPerDay}枚）に達しました`,
            hourlyRemaining: Math.max(0, hourlyRemaining),
            dailyRemaining: Math.max(0, dailyRemaining),
        };
    }

    return {
        allowed: true,
        hourlyRemaining: Math.max(0, hourlyRemaining - imageCount),
        dailyRemaining: Math.max(0, dailyRemaining - imageCount),
    };
}

/**
 * 処理を記録
 */
export function recordProcessing(sessionId: string, imageCount: number = 1): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    let record = processingRecords.get(sessionId);

    if (!record) {
        record = {
            hourly: { count: 0, startedAt: now },
            daily: { count: 0, startedAt: now },
        };
    }

    // ウィンドウリセット
    if (now - record.hourly.startedAt > oneHour) {
        record.hourly = { count: 0, startedAt: now };
    }
    if (now - record.daily.startedAt > oneDay) {
        record.daily = { count: 0, startedAt: now };
    }

    record.hourly.count += imageCount;
    record.daily.count += imageCount;

    processingRecords.set(sessionId, record);
    console.log(`[Security] セッション ${sessionId.substring(0, 8)}... : 今時間 ${record.hourly.count}枚, 今日 ${record.daily.count}枚`);
}

/**
 * 残り処理可能枚数を取得
 */
export function getRemainingProcessingCount(sessionId: string): {
    hourlyRemaining: number;
    dailyRemaining: number;
    maxPerHour: number;
    maxPerDay: number;
} {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    const record = processingRecords.get(sessionId);

    if (!record) {
        return {
            hourlyRemaining: SECURITY_CONFIG.processing.maxPerHour,
            dailyRemaining: SECURITY_CONFIG.processing.maxPerDay,
            maxPerHour: SECURITY_CONFIG.processing.maxPerHour,
            maxPerDay: SECURITY_CONFIG.processing.maxPerDay,
        };
    }

    let hourlyCount = record.hourly.count;
    let dailyCount = record.daily.count;

    // ウィンドウ外ならリセット
    if (now - record.hourly.startedAt > oneHour) {
        hourlyCount = 0;
    }
    if (now - record.daily.startedAt > oneDay) {
        dailyCount = 0;
    }

    return {
        hourlyRemaining: Math.max(0, SECURITY_CONFIG.processing.maxPerHour - hourlyCount),
        dailyRemaining: Math.max(0, SECURITY_CONFIG.processing.maxPerDay - dailyCount),
        maxPerHour: SECURITY_CONFIG.processing.maxPerHour,
        maxPerDay: SECURITY_CONFIG.processing.maxPerDay,
    };
}

// =============================================
// セッションタイムアウト
// =============================================

interface SessionActivity {
    createdAt: number;
    lastActivityAt: number;
}

const sessionActivities = new Map<string, SessionActivity>();

/**
 * セッションが有効かチェック
 */
export function isSessionValid(sessionToken: string): boolean {
    const now = Date.now();
    const activity = sessionActivities.get(sessionToken);

    if (!activity) {
        // 新規セッション → 記録して有効
        sessionActivities.set(sessionToken, {
            createdAt: now,
            lastActivityAt: now,
        });
        return true;
    }

    // タイムアウトチェック
    if (now - activity.lastActivityAt > SECURITY_CONFIG.session.timeoutMs) {
        console.log(`[Security] セッションタイムアウト: ${sessionToken.substring(0, 8)}...`);
        sessionActivities.delete(sessionToken);
        return false;
    }

    // アクティビティ更新
    activity.lastActivityAt = now;
    sessionActivities.set(sessionToken, activity);
    return true;
}

/**
 * セッションを無効化
 */
export function invalidateSession(sessionToken: string): void {
    sessionActivities.delete(sessionToken);
}

/**
 * セッションの残り時間を取得（ミリ秒）
 */
export function getSessionRemainingTime(sessionToken: string): number {
    const activity = sessionActivities.get(sessionToken);
    if (!activity) return 0;

    const elapsed = Date.now() - activity.lastActivityAt;
    return Math.max(0, SECURITY_CONFIG.session.timeoutMs - elapsed);
}

// =============================================
// クリーンアップ（定期実行用）
// =============================================

/**
 * 期限切れのデータをクリーンアップ
 */
export function cleanupExpiredData(): void {
    const now = Date.now();

    // ログイン試行記録のクリーンアップ
    Array.from(loginAttempts.entries()).forEach(([ip, attempt]) => {
        if (attempt.lockedUntil && now > attempt.lockedUntil) {
            loginAttempts.delete(ip);
        } else if (now - attempt.firstAttemptAt > SECURITY_CONFIG.login.attemptWindowMs * 2) {
            loginAttempts.delete(ip);
        }
    });

    // セッションアクティビティのクリーンアップ
    Array.from(sessionActivities.entries()).forEach(([token, activity]) => {
        if (now - activity.lastActivityAt > SECURITY_CONFIG.session.timeoutMs) {
            sessionActivities.delete(token);
        }
    });

    // 処理記録のクリーンアップ（1日以上前）
    const oneDay = 24 * 60 * 60 * 1000;
    Array.from(processingRecords.entries()).forEach(([sessionId, record]) => {
        if (now - record.daily.startedAt > oneDay * 2) {
            processingRecords.delete(sessionId);
        }
    });
}

// 1時間ごとにクリーンアップ
setInterval(cleanupExpiredData, 60 * 60 * 1000);
