import { getBrowser } from './browser.js';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

let page = null;

export async function createPage() {
  const browser = getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  page = await context.newPage();

  page.on('pageerror', err => logger.warn('Page JS error', { error: err.message }));

  logger.success('Page created');
  return page;
}

export async function navigateTo(url) {
  logger.info(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  logger.success(`Loaded: ${url}`);
}

export async function login() {
  const email    = process.env.FL_EMAIL;
  const password = process.env.FL_PASSWORD;
  const baseUrl  = process.env.FL_BASE_URL;

  if (!email || !password) throw new Error('FL_EMAIL and FL_PASSWORD must be set in .env');

  await navigateTo(baseUrl);

  logger.info('Waiting for login form...');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  logger.action('Submitting login form');
  await page.click('button.button--primary');

  logger.info('Waiting for post-login redirect...');
  await page.waitForFunction(
    () => !window.location.href.includes('/login'),
    { timeout: 30000 }
  );

  logger.info('Waiting for game UI to fully render...');
  await page.waitForSelector('button.button--go', { timeout: 360000 });

  logger.success(`Logged in — now at: ${page.url()}`);
}

export function getPage() {
  if (!page) throw new Error('Page not created. Call createPage() first.');
  return page;
}