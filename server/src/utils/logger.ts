/**
 * Redacting logger that strips bot tokens, auth cookies, passwords, and sensitive keys.
 */

const SENSITIVE_KEYS = [
  'token',
  'bottoken',
  'discordbottoken',
  'authorization',
  'cookie',
  'password',
  'secret',
  'csrftoken',
  'sessionid'
];

function redactValue(key: string, value: any): any {
  if (typeof value === 'string') {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      return '[REDACTED]';
    }
    // Check if value looks like a Discord bot token (Base64.Base64.HMAC structure)
    if (/[MNO][a-zA-Z0-9_-]{23,28}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,}/.test(value)) {
      return '[REDACTED_DISCORD_TOKEN]';
    }
  } else if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map((item, index) => redactValue(String(index), item));
    }
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = redactValue(k, v);
    }
    return sanitized;
  }
  return value;
}

export const logger = {
  info: (msg: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    if (meta !== undefined) {
      console.log(`[${timestamp}] [INFO] ${msg}`, redactValue('', meta));
    } else {
      console.log(`[${timestamp}] [INFO] ${msg}`);
    }
  },
  warn: (msg: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    if (meta !== undefined) {
      console.warn(`[${timestamp}] [WARN] ${msg}`, redactValue('', meta));
    } else {
      console.warn(`[${timestamp}] [WARN] ${msg}`);
    }
  },
  error: (msg: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    if (meta !== undefined) {
      console.error(`[${timestamp}] [ERROR] ${msg}`, redactValue('', meta));
    } else {
      console.error(`[${timestamp}] [ERROR] ${msg}`);
    }
  },
  debug: (msg: string, meta?: any) => {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      const timestamp = new Date().toISOString();
      if (meta !== undefined) {
        console.log(`[${timestamp}] [DEBUG] ${msg}`, redactValue('', meta));
      } else {
        console.log(`[${timestamp}] [DEBUG] ${msg}`);
      }
    }
  }
};
