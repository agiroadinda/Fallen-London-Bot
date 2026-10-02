const LEVELS = { info: 'INFO', success: 'SUCCESS', warn: 'WARN', error: 'ERROR', action: 'ACTION', state: 'STATE' };

const COLORS = {
  INFO:    '\x1b[36m',
  SUCCESS: '\x1b[32m',
  WARN:    '\x1b[33m',
  ERROR:   '\x1b[31m',
  ACTION:  '\x1b[35m',
  STATE:   '\x1b[34m',
  RESET:   '\x1b[0m'
};

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function log(level, message, data = null) {
  const color = COLORS[level] ?? COLORS.RESET;
  const prefix = `[${timestamp()}] [${level.padEnd(7)}]`;
  const line = data
    ? `${color}${prefix} ${message}${COLORS.RESET} ${JSON.stringify(data)}`
    : `${color}${prefix} ${message}${COLORS.RESET}`;
  console.log(line);
}

export const logger = {
  info:    (msg, data) => log(LEVELS.info,    msg, data),
  success: (msg, data) => log(LEVELS.success, msg, data),
  warn:    (msg, data) => log(LEVELS.warn,    msg, data),
  error:   (msg, data) => log(LEVELS.error,   msg, data),
  action:  (msg, data) => log(LEVELS.action,  msg, data),
  state:   (msg, data) => log(LEVELS.state,   msg, data),
};