import { DateTime } from 'luxon';
import { FilterConfig } from '../types';

export class FilterService {
  /**
   * Format UTC ISO timestamp into the specified IANA timezone
   */
  public static formatLocalTimestamp(isoUtc: string, timezone: string): string {
    try {
      const dt = DateTime.fromISO(isoUtc, { zone: 'utc' }).setZone(timezone);
      if (!dt.isValid) return isoUtc;
      return dt.toFormat('yyyy-MM-dd hh:mm:ss a ZZZZ');
    } catch {
      return isoUtc;
    }
  }

  /**
   * Check if a message satisfies all user, date, and time filter conditions
   */
  public static matchesFilter(
    message: {
      authorId: string;
      timestampUtc: string;
    },
    filter: FilterConfig
  ): boolean {
    // 1. Mandatory User ID check (strict immutable Discord User ID matching)
    if (!filter.targetUserId || message.authorId !== filter.targetUserId.trim()) {
      return false;
    }

    const timezone = filter.timezone || 'UTC';
    const msgDateTime = DateTime.fromISO(message.timestampUtc, { zone: 'utc' }).setZone(timezone);

    if (!msgDateTime.isValid) {
      return false;
    }

    // Reference now in the target timezone for relative presets
    const nowInTz = DateTime.now().setZone(timezone);
    const msgDateStr = msgDateTime.toFormat('yyyy-MM-dd'); // e.g. "2026-08-15"

    // 2. Evaluate Date Filter
    const dateMatches = this.evaluateDateFilter(msgDateTime, msgDateStr, filter, nowInTz);
    if (!dateMatches) {
      return false;
    }

    // 3. Evaluate Time Filter
    const timeMatches = this.evaluateTimeFilter(msgDateTime, filter);
    if (!timeMatches) {
      return false;
    }

    return true;
  }

  private static evaluateDateFilter(
    msgDateTime: DateTime,
    msgDateStr: string,
    filter: FilterConfig,
    nowInTz: DateTime
  ): boolean {
    const { dateMode, startDate, endDate } = filter;

    switch (dateMode) {
      case 'ALL_TIME':
        return true;

      case 'SPECIFIC_DATE':
        if (!startDate) return true;
        return msgDateStr === startDate;

      case 'BEFORE_DATE':
        if (!startDate) return true;
        return msgDateStr < startDate;

      case 'AFTER_DATE':
        if (!startDate) return true;
        return msgDateStr > startDate;

      case 'BETWEEN_DATES':
      case 'CUSTOM_RANGE':
        if (startDate && endDate) {
          return msgDateStr >= startDate && msgDateStr <= endDate;
        } else if (startDate) {
          return msgDateStr >= startDate;
        } else if (endDate) {
          return msgDateStr <= endDate;
        }
        return true;

      case 'TODAY': {
        const todayStr = nowInTz.toFormat('yyyy-MM-dd');
        return msgDateStr === todayStr;
      }

      case 'YESTERDAY': {
        const yesterdayStr = nowInTz.minus({ days: 1 }).toFormat('yyyy-MM-dd');
        return msgDateStr === yesterdayStr;
      }

      case 'LAST_7_DAYS': {
        const start7 = nowInTz.minus({ days: 7 }).startOf('day');
        const end7 = nowInTz.endOf('day');
        return msgDateTime >= start7 && msgDateTime <= end7;
      }

      case 'LAST_30_DAYS': {
        const start30 = nowInTz.minus({ days: 30 }).startOf('day');
        const end30 = nowInTz.endOf('day');
        return msgDateTime >= start30 && msgDateTime <= end30;
      }

      default:
        return true;
    }
  }

  private static evaluateTimeFilter(
    msgDateTime: DateTime,
    filter: FilterConfig
  ): boolean {
    const { timeMode, startTime, endTime } = filter;

    if (timeMode === 'ANY_TIME') {
      return true;
    }

    // Convert message time of day to total minutes from midnight (0 to 1439)
    const msgMinutes = msgDateTime.hour * 60 + msgDateTime.minute;

    const parseMinutes = (tStr?: string): number | null => {
      if (!tStr) return null;
      const parts = tStr.split(':');
      if (parts.length < 2) return null;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };

    const startMin = parseMinutes(startTime);
    const endMin = parseMinutes(endTime);

    switch (timeMode) {
      case 'AFTER_TIME':
        if (startMin === null) return true;
        return msgMinutes >= startMin;

      case 'BEFORE_TIME':
        if (startMin === null) return true;
        return msgMinutes <= startMin;

      case 'BETWEEN_TIMES':
        if (startMin !== null && endMin !== null) {
          if (startMin <= endMin) {
            // Standard daytime window, e.g. 09:00 to 17:00
            return msgMinutes >= startMin && msgMinutes <= endMin;
          } else {
            // Overnight window, e.g. 22:00 to 04:00
            return msgMinutes >= startMin || msgMinutes <= endMin;
          }
        } else if (startMin !== null) {
          return msgMinutes >= startMin;
        } else if (endMin !== null) {
          return msgMinutes <= endMin;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Calculates message age in days relative to current time
   */
  public static calculateAgeDays(timestampUtc: string): number {
    const msgTime = DateTime.fromISO(timestampUtc, { zone: 'utc' });
    const now = DateTime.utc();
    const diff = now.diff(msgTime, 'days').days;
    return Math.max(0, diff);
  }
}
