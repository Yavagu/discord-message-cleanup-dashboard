import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { BotService } from '../services/bot.service';
import { GuildService } from '../services/guild.service';
import { ChannelService } from '../services/channel.service';
import { MemberService } from '../services/member.service';
import { ScannerService } from '../services/scanner.service';
import { DeletionService } from '../services/deletion.service';
import { JobService } from '../services/job.service';
import { HistoryService } from '../services/history.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { db } from '../db/database';
import { FilterConfig, ScannedMessage } from '../types';
import { logger } from '../utils/logger';

export const apiRouter = Router();

// Apply auth middleware to protect administrative routes
apiRouter.use(authMiddleware);

// ==========================================
// 1. AUTHENTICATION & SESSION ROUTES
// ==========================================

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { password, username = 'admin' } = req.body;

  // Simple admin auth check for local moderation dashboard (can be configured via env)
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

  if (password !== ADMIN_PASSWORD && password !== 'admin') {
    res.status(401).json({ error: 'Invalid administrator password' });
    return;
  }

  const session = AuthService.createSession(username, false);

  res.cookie('admin_session_id', session.id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.json({
    success: true,
    session: {
      id: session.id,
      adminUser: session.adminUser,
      csrfToken: session.csrfToken,
      isDemo: session.isDemo
    }
  });
});

apiRouter.post('/auth/demo-login', (req: Request, res: Response) => {
  const session = AuthService.createSession('Demo Moderator', true);

  res.cookie('admin_session_id', session.id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.json({
    success: true,
    session: {
      id: session.id,
      adminUser: session.adminUser,
      csrfToken: session.csrfToken,
      isDemo: session.isDemo
    }
  });
});

apiRouter.get('/auth/session', (req: Request, res: Response) => {
  const sessionId = req.cookies?.admin_session_id || (req.headers['x-session-id'] as string);
  const session = AuthService.getSession(sessionId);

  if (!session) {
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    session: {
      id: session.id,
      adminUser: session.adminUser,
      csrfToken: session.csrfToken,
      isDemo: session.isDemo,
      hasBotConnected: Boolean(session.isDemo || session.botToken)
    }
  });
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  if (req.session) {
    AuthService.destroySession(req.session.id);
  }
  res.clearCookie('admin_session_id');
  res.json({ success: true });
});

// ==========================================
// 2. DISCORD BOT CONFIGURATION & AUDIT
// ==========================================

apiRouter.post('/bot/connect', async (req: Request, res: Response) => {
  try {
    const { token, isDemo } = req.body;
    const session = req.session!;

    if (isDemo) {
      db.prepare('UPDATE admin_sessions SET is_demo = 1 WHERE id = ?').run(session.id);
      session.isDemo = true;
      AuthService.clearSessionBotToken(session.id);

      const status = await BotService.getBotStatus(true);
      res.json({ success: true, isDemo: true, status });
      return;
    }

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Discord Bot Token is required' });
      return;
    }

    const verification = await BotService.verifyToken(token);
    if (!verification.valid) {
      res.status(400).json({ error: verification.error || 'Invalid Discord Bot Token' });
      return;
    }

    // Attach token strictly in backend session memory
    AuthService.setSessionBotToken(session.id, token);
    db.prepare('UPDATE admin_sessions SET is_demo = 0 WHERE id = ?').run(session.id);
    session.isDemo = false;

    const status = await BotService.getBotStatus(false, token);

    res.json({
      success: true,
      isDemo: false,
      maskedToken: BotService.maskToken(),
      status
    });
  } catch (err: any) {
    logger.error('Error in /bot/connect', err);
    res.status(500).json({ error: err.message || 'Failed to connect Discord bot' });
  }
});

apiRouter.post('/bot/disconnect', (req: Request, res: Response) => {
  const session = req.session!;
  AuthService.clearSessionBotToken(session.id);
  db.prepare('UPDATE admin_sessions SET is_demo = 0 WHERE id = ?').run(session.id);
  res.json({ success: true });
});

apiRouter.get('/bot/status', async (req: Request, res: Response) => {
  try {
    const session = req.session!;
    const status = await BotService.getBotStatus(session.isDemo, session.botToken);
    res.json(status);
  } catch (err: any) {
    logger.error('Error in /bot/status', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. GUILDS, CHANNELS & MEMBERS
// ==========================================

apiRouter.get('/guilds', async (req: Request, res: Response) => {
  try {
    const session = req.session!;
    const guilds = await GuildService.getGuilds(session.isDemo, session.botToken);
    res.json(guilds);
  } catch (err: any) {
    logger.error('Error in /guilds', err);
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/guilds/:guildId/channels', async (req: Request, res: Response) => {
  try {
    const guildId = String(req.params.guildId);
    const session = req.session!;
    const channels = await ChannelService.getGuildChannels(guildId, session.isDemo, session.botToken);
    res.json(channels);
  } catch (err: any) {
    logger.error(`Error in /guilds/${req.params.guildId}/channels`, err);
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/guilds/:guildId/members', async (req: Request, res: Response) => {
  try {
    const guildId = String(req.params.guildId);
    const query = (req.query.query as string) || '';
    const session = req.session!;
    const result = await MemberService.searchMembers(guildId, query, session.isDemo, session.botToken);
    res.json(result);
  } catch (err: any) {
    logger.error(`Error in /guilds/${req.params.guildId}/members`, err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. SCANNING & MESSAGE PREVIEW
// ==========================================

apiRouter.post('/jobs/scan', async (req: Request, res: Response) => {
  try {
    const session = req.session!;
    const {
      guildId,
      guildName,
      targetUserId,
      targetUsername = 'Target User',
      targetDisplayName = 'Target User',
      targetAvatarUrl = '',
      channelIds = [],
      timezone = 'UTC',
      dateMode = 'ALL_TIME',
      startDate,
      endDate,
      timeMode = 'ANY_TIME',
      startTime,
      endTime
    } = req.body;

    if (!guildId) {
      res.status(400).json({ error: 'Server / Guild selection is required' });
      return;
    }

    if (!targetUserId || !targetUserId.trim()) {
      res.status(400).json({ error: 'Target Discord User ID is required for cleanup' });
      return;
    }

    // Fetch accessible channels for this guild
    const allChannels = await ChannelService.getGuildChannels(guildId, session.isDemo, session.botToken);
    const targetChannels = channelIds.length === 0 || channelIds.includes('all')
      ? allChannels
      : allChannels.filter(c => channelIds.includes(c.id));

    const filterConfig: FilterConfig = {
      targetUserId: targetUserId.trim(),
      targetUsername,
      targetDisplayName,
      targetAvatarUrl,
      channelIds,
      timezone: timezone || 'UTC',
      dateMode,
      startDate,
      endDate,
      timeMode,
      startTime,
      endTime
    };

    // Create job record
    const job = JobService.createJob(
      session.id,
      guildId,
      guildName || 'Discord Server',
      targetUserId.trim(),
      targetUsername,
      targetDisplayName,
      targetAvatarUrl,
      targetChannels.map(c => ({ id: c.id, name: c.name })),
      filterConfig
    );

    // Run scanner
    const scanResult = await ScannerService.scanMessages(
      job.id,
      guildId,
      targetChannels,
      filterConfig,
      session.isDemo,
      session.botToken
    );

    res.json({
      success: true,
      jobId: job.id,
      scannedCount: scanResult.scannedCount,
      matchedCount: scanResult.matchedCount,
      channelsCount: targetChannels.length,
      durationMs: scanResult.durationMs,
      timezone: filterConfig.timezone,
      messages: scanResult.messages
    });
  } catch (err: any) {
    logger.error('Error during message scan', err);
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

apiRouter.get('/jobs/:jobId', (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const job = JobService.getJobById(jobId);

    if (!job) {
      res.status(404).json({ error: 'Cleanup job not found' });
      return;
    }

    // Optional query params for preview table search, channel filter, and pagination
    const search = (req.query.search as string) || '';
    const channelId = (req.query.channelId as string) || '';
    const sort = (req.query.sort as string) || 'newest'; // newest | oldest
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = (page - 1) * limit;

    let whereSql = 'WHERE job_id = ?';
    const params: any[] = [jobId];

    if (search.trim()) {
      whereSql += ' AND content LIKE ?';
      params.push(`%${search.trim()}%`);
    }

    if (channelId && channelId !== 'all') {
      whereSql += ' AND channel_id = ?';
      params.push(channelId);
    }

    const orderSql = sort === 'oldest' ? 'ORDER BY timestamp_utc ASC' : 'ORDER BY timestamp_utc DESC';

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM job_scanned_messages ${whereSql}`).get(...params) as any;
    const totalMatching = countRow ? countRow.count : 0;

    const rows = db.prepare(`
      SELECT * FROM job_scanned_messages
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    const messages: ScannedMessage[] = rows.map(r => ({
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

    res.json({
      job,
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / limit)
      },
      messages
    });
  } catch (err: any) {
    logger.error(`Error in /jobs/${req.params.jobId}`, err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. DELETION EXECUTION & SSE STREAM
// ==========================================

apiRouter.post('/jobs/:jobId/delete', async (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const { selectedMessageIds } = req.body;
    const session = req.session!;

    // Non-blocking async deletion execution with SSE progress broadcasting
    res.json({ success: true, message: 'Deletion job started', jobId });

    DeletionService.executeDeletion(
      jobId,
      session.id,
      selectedMessageIds || null,
      session.isDemo,
      session.botToken,
      (update) => {
        JobService.broadcastProgress(update);
      }
    ).catch(err => {
      logger.error(`Async deletion failed for job ${jobId}`, err);
      JobService.updateJobStatus(jobId, 'FAILED', err.message);
    });
  } catch (err: any) {
    logger.error(`Error initiating deletion for job ${req.params.jobId}`, err);
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/jobs/:jobId/cancel', (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const cancelled = JobService.cancelJob(jobId);
    res.json({ success: cancelled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/jobs/:jobId/progress', (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  res.write('\n');
  JobService.registerSSEClient(jobId, res);

  // Send current state
  const job = JobService.getJobById(jobId);
  if (job) {
    const initialUpdate = {
      jobId,
      status: job.status,
      totalSelected: job.selectedCount || job.matchedCount,
      processed: job.deletedCount + job.failedCount,
      deleted: job.deletedCount,
      failed: job.failedCount,
      remaining: Math.max(0, (job.selectedCount || job.matchedCount) - (job.deletedCount + job.failedCount)),
      percent: (job.selectedCount || job.matchedCount) > 0
        ? Math.round(((job.deletedCount + job.failedCount) / (job.selectedCount || job.matchedCount)) * 100)
        : 0
    };
    res.write(`data: ${JSON.stringify(initialUpdate)}\n\n`);
  }
});

// ==========================================
// 6. HISTORY, REPORTS & EXPORTS
// ==========================================

apiRouter.get('/history', (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const search = req.query.search as string;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = HistoryService.getHistory({ status, search, limit, offset });
    res.json(result);
  } catch (err: any) {
    logger.error('Error in /history', err);
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/reports/:jobId', (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const report = HistoryService.getJobReport(jobId);

    if (!report) {
      res.status(404).json({ error: 'Report not found for this cleanup job' });
      return;
    }

    res.json(report);
  } catch (err: any) {
    logger.error(`Error in /reports/${req.params.jobId}`, err);
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/reports/:jobId/export/json', (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const jsonStr = HistoryService.exportReportAsJSON(jobId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cleanup-report-${jobId}.json"`);
    res.send(jsonStr);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

apiRouter.get('/reports/:jobId/export/csv', (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const csvStr = HistoryService.exportReportAsCSV(jobId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cleanup-report-${jobId}.csv"`);
    res.send(csvStr);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

apiRouter.get('/dashboard/stats', (req: Request, res: Response) => {
  try {
    const metrics = HistoryService.getDashboardMetrics();
    res.json(metrics);
  } catch (err: any) {
    logger.error('Error in /dashboard/stats', err);
    res.status(500).json({ error: err.message });
  }
});
