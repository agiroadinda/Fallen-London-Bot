import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

let browser = null;

export async function launchBrowser() {
  logger.info('Launching browser...');

  browser = await chromium.launch({
    headless: process.env.FL_HEADLESS === 'true',
    slowMo:   Number(process.env.FL_SLOW_MO) || 80,
  });

  logger.success('Browser launched');
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    logger.info('Browser closed');
  }
}

export function getBrowser() {
  if (!browser) throw new Error('Browser not launched. Call launchBrowser() first.');
  return browser;
}