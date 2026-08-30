import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { BotService } from '../services/bot.service';
import { GuildService } from '../services/guild.service';
import { ChannelService } from '../services/channel.service';
import { MemberService } from '../services/member.service';
import { ScannerService } from '../services/scanner.service';
import { DeletionService } from '../services/deletion.service';
import { JobService } from '../services/job.service';
import { HistoryService } from '../services/history.service';
import { SettingsService } from '../services/settings.service';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  DISCORD_BULK_DELETE_MAX_CONFIGURABLE_HOURS,
  DISCORD_BULK_DELETE_MIN_CONFIGURABLE_HOURS,
  DISCORD_MAX_PACING_MS,
  DISCORD_MIN_PACING_MS
} from '../constants/discord.constants';
import { db } from '../db/database';
import { FilterConfig, ScannedMessage } from '../types';
import { logger } from '../utils/logger';

export const apiRouter = Router();

apiRouter.use(authMiddleware);

// Authentication & Session Routes

const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  username: z.string().optional().default('admin')
});

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.errors[0]?.message || 'Invalid login request' });
    return;
  }

  const { password, username } = parseResult.data;

  const isValid = AuthService.verifyPassword(password);
  if (!isValid) {
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

// Discord Bot Management

const botConnectSchema = z.object({
  token: z.string().optional(),
  isDemo: z.boolean().optional().default(false)
});

apiRouter.post('/bot/connect', async (req: Request, res: Response) => {
  try {
    const parseResult = botConnectSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message || 'Invalid connection payload' });
      return;
    }

    const { token, isDemo } = parseResult.data;
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

// Guilds, Channels & Members

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

// Message Scanning & Search

const scanRequestSchema = z.object({
  guildId: z.string().min(1, 'Server ID is required'),
  guildName: z.string().optional().default('Discord Server'),
  targetUserId: z.string().regex(/^\d{17,20}$/, 'Target User ID must be a valid 17-20 digit Snowflake ID'),
  targetUsername: z.string().optional().default('Target User'),
  targetDisplayName: z.string().optional().default('Target User'),
  targetAvatarUrl: z.string().optional().default(''),
  channelIds: z.array(z.string()).optional().default([]),
  timezone: z.string().optional().default('UTC'),
  dateMode: z.enum([
    'ALL_TIME',
    'SPECIFIC_DATE',
    'BEFORE_DATE',
    'AFTER_DATE',
    'BETWEEN_DATES',
    'TODAY',
    'YESTERDAY',
    'LAST_7_DAYS',
    'LAST_30_DAYS',
    'CUSTOM_RANGE'
  ]).optional().default('ALL_TIME'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timeMode: z.enum(['ANY_TIME', 'AFTER_TIME', 'BEFORE_TIME', 'BETWEEN_TIMES']).optional().default('ANY_TIME'),
  startTime: z.string().optional(),
  endTime: z.string().optional()
});

apiRouter.post('/jobs/scan', async (req: Request, res: Response) => {
  try {
    const parseResult = scanRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message || 'Invalid scan parameters' });
      return;
    }

    const session = req.session!;
    const {
      guildId,
      guildName,
      targetUserId,
      targetUsername,
      targetDisplayName,
      targetAvatarUrl,
      channelIds,
      timezone,
      dateMode,
      startDate,
      endDate,
      timeMode,
      startTime,
      endTime
    } = parseResult.data;

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
    const session = req.session!;
    const job = JobService.getJobForSession(jobId, session.id);

    if (!job) {
      res.status(404).json({ error: 'Cleanup job not found or unauthorized' });
      return;
    }

    const search = (req.query.search as string) || '';
    const channelId = (req.query.channelId as string) || '';
    const sort = (req.query.sort as string) || 'newest';
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

// Deletion Execution & Live Progress Stream

const deleteRequestSchema = z.object({
  selectedMessageIds: z.array(z.string()).optional(),
  confirmed: z.boolean().optional()
});

apiRouter.post('/jobs/:jobId/delete', async (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const parseResult = deleteRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid delete request payload' });
      return;
    }

    const { selectedMessageIds, confirmed } = parseResult.data;
    const session = req.session!;

    const settings = SettingsService.getSettings();
    if (settings.requireDoubleConfirm && confirmed !== true) {
      res.status(400).json({
        error: 'Administrative confirmation is required to execute deletion',
        code: 'CONFIRMATION_REQUIRED'
      });
      return;
    }

    // Atomically authorize and reserve job execution (transitions READY -> DELETING)
    const reservation = DeletionService.reserveExecution(jobId, session.id, selectedMessageIds || null);
    if (!reservation.success) {
      if (reservation.code === 'NOT_FOUND') {
        res.status(404).json({ error: reservation.error });
        return;
      }
      if (reservation.code === 'CONFLICT') {
        res.status(409).json({ error: reservation.error, code: 'EXECUTION_CONFLICT' });
        return;
      }
      res.status(400).json({ error: reservation.error, code: reservation.code });
      return;
    }

    res.json({ success: true, message: 'Deletion job started', jobId });

    // Run deletion asynchronously using the pre-reserved execution lock and target rows
    DeletionService.executeDeletion(
      jobId,
      session.id,
      selectedMessageIds || null,
      session.isDemo,
      session.botToken,
      (update) => {
        JobService.broadcastProgress(update);
      },
      reservation.targetRows
    ).catch(err => {
      logger.error(`Async deletion failed for job ${jobId}`, err);
    });
  } catch (err: any) {
    logger.error(`Error initiating deletion for job ${req.params.jobId}`, err);
    res.status(500).json({ error: err.message || 'Failed to initiate deletion' });
  }
});

apiRouter.post('/jobs/:jobId/cancel', (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);
    const session = req.session!;
    const cancelled = JobService.cancelJobForSession(jobId, session.id);
    if (!cancelled) {
      res.status(404).json({ error: 'Cleanup job not found or unauthorized' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/jobs/:jobId/progress', (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const session = req.session!;

  const job = JobService.getJobForSession(jobId, session.id);
  if (!job) {
    res.status(404).json({ error: 'Cleanup job not found or unauthorized' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  res.write('\n');
  JobService.registerSSEClientForSession(jobId, session.id, res);

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
});

// History, Reports & Exports

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
    const session = req.session!;
    const report = HistoryService.getJobReportForSession(jobId, session.id);

    if (!report) {
      res.status(404).json({ error: 'Report not found or unauthorized' });
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
    const session = req.session!;
    const jsonStr = HistoryService.exportReportAsJSONForSession(jobId, session.id);
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
    const session = req.session!;
    const csvStr = HistoryService.exportReportAsCSVForSession(jobId, session.id);
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

// Application Settings

const updateSettingsSchema = z.object({
  pacingMs: z.number().min(DISCORD_MIN_PACING_MS).max(DISCORD_MAX_PACING_MS).optional(),
  bulkCutoffHours: z.number().min(DISCORD_BULK_DELETE_MIN_CONFIGURABLE_HOURS).max(DISCORD_BULK_DELETE_MAX_CONFIGURABLE_HOURS).optional(),
  requireDoubleConfirm: z.boolean().optional(),
  defaultTimezone: z.string().min(1).optional(),
  maxMessagesPerChannel: z.number().min(1).max(10000).optional()
});

apiRouter.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = SettingsService.getSettings();
    res.json(settings);
  } catch (err: any) {
    logger.error('Error fetching settings', err);
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  try {
    const parseResult = updateSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: parseResult.error.errors[0]?.message || 'Invalid settings payload',
        details: parseResult.error.errors
      });
      return;
    }

    const updated = SettingsService.updateSettings(parseResult.data);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    logger.error('Error updating settings', err);
    res.status(500).json({ error: err.message });
  }
});
