import { logger } from './logger.js';

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(minMs = 500, maxMs = 1500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return delay(ms);
}

export async function retry(fn, options = {}) {
  const {
    attempts = 3,
    delayMs  = 1000,
    label    = 'operation',
  } = options;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = i === attempts;
      if (isLast) {
        logger.error(`${label} failed after ${attempts} attempts`, { error: err.message });
        throw err;
      }
      logger.warn(`${label} failed, retrying (${i}/${attempts})`, { error: err.message });
      await delay(delayMs * i);
    }
  }
}

export function withTimeout(promise, ms, label = 'operation') {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}