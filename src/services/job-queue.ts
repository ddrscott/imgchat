/**
 * Job queue service for persistent generation tracking
 */

import type { GenerationJob, GenerationParams, JobStatus, ProviderType } from '../providers/types';
import type { Env } from '../types/env';

export interface CreateJobParams {
  sessionId: string;
  messageId: string;
  userId: string;
  model: string;
  provider: ProviderType;
  prompt: string;
  params: GenerationParams;
}

/**
 * Create a new generation job
 */
export async function createJob(
  db: D1Database,
  params: CreateJobParams
): Promise<GenerationJob> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `
    INSERT INTO generation_jobs (id, session_id, message_id, user_id, status, model, provider, prompt, params, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(
      params.messageId, // Use messageId as job id for simplicity
      params.sessionId,
      params.messageId,
      params.userId,
      params.model,
      params.provider,
      params.prompt,
      JSON.stringify(params.params),
      now,
      now
    )
    .run();

  return {
    id: params.messageId,
    session_id: params.sessionId,
    message_id: params.messageId,
    user_id: params.userId,
    status: 'pending',
    model: params.model,
    provider: params.provider,
    prompt: params.prompt,
    params: JSON.stringify(params.params),
    error_message: null,
    attempts: 0,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
}

/**
 * Update job status
 */
export async function updateJobStatus(
  db: D1Database,
  jobId: string,
  status: JobStatus,
  errorMessage?: string
): Promise<void> {
  const now = new Date().toISOString();
  const completedAt = status === 'completed' || status === 'failed' ? now : null;

  await db
    .prepare(
      `
    UPDATE generation_jobs
    SET status = ?, error_message = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `
    )
    .bind(status, errorMessage || null, now, completedAt, jobId)
    .run();
}

/**
 * Mark job as processing and increment attempts
 */
export async function markJobProcessing(db: D1Database, jobId: string): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `
    UPDATE generation_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = ?
    WHERE id = ?
  `
    )
    .bind(now, jobId)
    .run();
}

/**
 * Get a job by ID
 */
export async function getJob(db: D1Database, jobId: string): Promise<GenerationJob | null> {
  return db
    .prepare('SELECT * FROM generation_jobs WHERE id = ?')
    .bind(jobId)
    .first<GenerationJob>();
}

/**
 * Get pending/processing jobs for a user
 */
export async function getPendingJobs(
  db: D1Database,
  userId: string
): Promise<GenerationJob[]> {
  const result = await db
    .prepare(
      `
    SELECT * FROM generation_jobs
    WHERE user_id = ? AND status IN ('pending', 'processing')
    ORDER BY created_at ASC
  `
    )
    .bind(userId)
    .all<GenerationJob>();

  return result.results || [];
}

/**
 * Get pending/processing jobs for a session
 */
export async function getSessionPendingJobs(
  db: D1Database,
  sessionId: string
): Promise<GenerationJob[]> {
  const result = await db
    .prepare(
      `
    SELECT * FROM generation_jobs
    WHERE session_id = ? AND status IN ('pending', 'processing')
    ORDER BY created_at ASC
  `
    )
    .bind(sessionId)
    .all<GenerationJob>();

  return result.results || [];
}

/**
 * Delete completed/failed jobs older than specified hours
 */
export async function cleanupOldJobs(db: D1Database, hoursOld: number = 24): Promise<void> {
  const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `
    DELETE FROM generation_jobs
    WHERE status IN ('completed', 'failed') AND completed_at < ?
  `
    )
    .bind(cutoff)
    .run();
}

/**
 * Delete a job
 */
export async function deleteJob(db: D1Database, jobId: string): Promise<void> {
  await db.prepare('DELETE FROM generation_jobs WHERE id = ?').bind(jobId).run();
}
