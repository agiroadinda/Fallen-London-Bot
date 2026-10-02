import { launchBrowser, closeBrowser } from './browser.js';
import { createPage, login, getPage } from './page.js';
import { runTask } from '../core/engine.js';
import { logger } from '../utils/logger.js';
import { readFile } from 'fs/promises';
import 'dotenv/config';

try {
  await launchBrowser();
  await createPage();
  await login();

  logger.info('--- Testing engine ---');

  const raw  = await readFile('src/tasks/example-task.json', 'utf-8');
  const task = JSON.parse(raw);

  await runTask(task);

} catch (err) {
  logger.error('Engine test failed', { error: err.message });
} finally {
  await closeBrowser();
}