import { db } from '../db/database';
import { CleanupFailure, CleanupJob, ScannedMessage } from '../types';
import { JobService } from './job.service';

export interface HistoryFilterParams {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DetailedCleanupReport {
  job: CleanupJob;
  successRatePercent: number;
  channelsSearched: Array<{ id: string; name: string }>;
  channelBreakdown: Array<{
    channelId: string;
    channelName: string;
    matched: number;
    deleted: number;
    failed: number;
  }>;
  failures: CleanupFailure[];
  scannedSample: ScannedMessage[];
}

export class HistoryService {
  /**
   * Get paginated list of cleanup jobs
   */
  public static getHistory(params: HistoryFilterParams = {}): {
    jobs: CleanupJob[];
    total: number;
  } {
    const { status, search, limit = 50, offset = 0 } = params;

    let whereClauses: string[] = [];
    const args: any[] = [];

    if (status && status !== 'ALL') {
      whereClauses.push('status = ?');
      args.push(status);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      whereClauses.push('(guild_name LIKE ? OR target_username LIKE ? OR target_display_name LIKE ? OR target_user_id LIKE ?)');
      args.push(s, s, s, s);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM cleanup_jobs ${whereSql}`).get(...args) as any;
    const total = countRow ? countRow.count : 0;

    const rows = db.prepare(`
      SELECT * FROM cleanup_jobs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...args, limit, offset) as any[];

    const jobs = rows.map(r => JobService.getJobById(r.id)!);

    return { jobs, total };
  }

  /**
   * Get detailed report for a specific job
   */
  public static getJobReport(jobId: string): DetailedCleanupReport | null {
    const job = JobService.getJobById(jobId);
    if (!job) return null;

    // Failures
    const failRows = db.prepare(`
      SELECT * FROM job_failures WHERE job_id = ? ORDER BY id ASC
    `).all(jobId) as any[];

    const failures: CleanupFailure[] = failRows.map(f => ({
      id: f.id,
      jobId: f.job_id,
      messageId: f.message_id,
      channelId: f.channel_id,
      channelName: f.channel_name,
      authorId: f.author_id,
      timestampUtc: f.timestamp_utc,
      errorCode: f.error_code,
      failureReason: f.failure_reason,
      suggestions: f.suggestions
    }));

    // Scanned sample
    const scannedRows = db.prepare(`
      SELECT * FROM job_scanned_messages WHERE job_id = ? ORDER BY id ASC LIMIT 500
    `).all(jobId) as any[];

    const scannedSample: ScannedMessage[] = scannedRows.map(r => ({
      id: r.message_id,
      channelId: r.channel_id,
      channelName: r.channel_name,
      authorId: r.author_id,
      authorUsername: r.author_username,
      authorDisplayName: r.author_display_name,
      authorAvatarUrl: r.author_avatar_url,
      content: r.content,
      timestampUtc: r.timestamp_utc,
      timestampLocalFormatted: r.timestamp_local_formatted,
      hasAttachments: Boolean(r.has_attachments),
      attachmentCount: r.attachment_count,
      hasEmbeds: Boolean(r.has_embeds),
      embedCount: r.embed_count,
      isBulkDeletable: Boolean(r.is_bulk_deletable),
      ageDays: r.age_days
    }));

    // Calculate channel breakdown
    let channelsSearched: Array<{ id: string; name: string }> = [];
    try {
      channelsSearched = JSON.parse(job.channelsJson);
    } catch {
      channelsSearched = [];
    }

    const channelStatsMap = new Map<string, { channelId: string; channelName: string; matched: number; deleted: number; failed: number }>();

    for (const msg of scannedRows) {
      if (!channelStatsMap.has(msg.channel_id)) {
        channelStatsMap.set(msg.channel_id, {
          channelId: msg.channel_id,
          channelName: msg.channel_name,
          matched: 0,
          deleted: 0,
          failed: 0
        });
      }
      channelStatsMap.get(msg.channel_id)!.matched++;
    }

    for (const f of failures) {
      if (channelStatsMap.has(f.channelId)) {
        channelStatsMap.get(f.channelId)!.failed++;
      }
    }

    for (const stat of channelStatsMap.values()) {
      stat.deleted = Math.max(0, stat.matched - stat.failed);
    }

    const totalSelected = job.selectedCount || job.matchedCount || 1;
    const successRatePercent = totalSelected > 0
      ? Math.round((job.deletedCount / totalSelected) * 1000) / 10
      : 0;

    return {
      job,
      successRatePercent,
      channelsSearched,
      channelBreakdown: Array.from(channelStatsMap.values()),
      failures,
      scannedSample
    };
  }

  /**
   * Export report as JSON string
   */
  public static exportReportAsJSON(jobId: string): string {
    const report = this.getJobReport(jobId);
    if (!report) throw new Error('Report not found');
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as CSV string
   */
  public static exportReportAsCSV(jobId: string): string {
    const report = this.getJobReport(jobId);
    if (!report) throw new Error('Report not found');

    const headers = ['Type', 'Message ID', 'Channel Name', 'Channel ID', 'Author ID', 'Author Username', 'Timestamp (Local)', 'Content / Reason', 'Error Code'];
    const rows: string[][] = [headers];

    // Add failures
    for (const f of report.failures) {
      rows.push([
        'FAILED',
        f.messageId,
        `"${(f.channelName || '').replace(/"/g, '""')}"`,
        f.channelId,
        f.authorId,
        report.job.targetUsername,
        f.timestampUtc,
        `"${(f.failureReason || '').replace(/"/g, '""')}"`,
        String(f.errorCode)
      ]);
    }

    // Add sample scanned / deleted
    for (const s of report.scannedSample) {
      rows.push([
        'SCANNED/DELETED',
        s.id,
        `"${(s.channelName || '').replace(/"/g, '""')}"`,
        s.channelId,
        s.authorId,
        s.authorUsername,
        s.timestampLocalFormatted,
        `"${(s.content || '').replace(/"/g, '""')}"`,
        'OK'
      ]);
    }

    return rows.map(r => r.join(',')).join('\n');
  }

  /**
   * Aggregate dashboard KPI metrics
   */
  public static getDashboardMetrics(): {
    totalScanned: number;
    totalDeleted: number;
    totalFailed: number;
    totalJobs: number;
    successRate: number;
    recentJobs: CleanupJob[];
  } {
    const statsRow = db.prepare(`
      SELECT
        COUNT(*) as totalJobs,
        COALESCE(SUM(scanned_count), 0) as totalScanned,
        COALESCE(SUM(deleted_count), 0) as totalDeleted,
        COALESCE(SUM(failed_count), 0) as totalFailed
      FROM cleanup_jobs
    `).get() as any;

    const totalJobs = statsRow ? Number(statsRow.totalJobs) : 0;
    const totalScanned = statsRow ? Number(statsRow.totalScanned) : 0;
    const totalDeleted = statsRow ? Number(statsRow.totalDeleted) : 0;
    const totalFailed = statsRow ? Number(statsRow.totalFailed) : 0;

    const processedTotal = totalDeleted + totalFailed;
    const successRate = processedTotal > 0
      ? Math.round((totalDeleted / processedTotal) * 1000) / 10
      : 100;

    const recentRows = db.prepare(`
      SELECT * FROM cleanup_jobs ORDER BY created_at DESC LIMIT 6
    `).all() as any[];

    const recentJobs = recentRows.map(r => JobService.getJobById(r.id)!);

    return {
      totalScanned,
      totalDeleted,
      totalFailed,
      totalJobs,
      successRate,
      recentJobs
    };
  }
}
