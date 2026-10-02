import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { launchBrowser, closeBrowser } from './browser/browser.js';
import { createPage, login } from './browser/page.js';
import { runTask } from './core/engine.js';
import { logger } from './utils/logger.js';
import 'dotenv/config';


let shutdownRequested = false;

async function shutdown(reason = 'unknown') {
  if (shutdownRequested) return;
  shutdownRequested = true;

  logger.warn(`Shutting down — reason: ${reason}`);

  try {
    await closeBrowser();
    logger.info('Browser closed cleanly');
  } catch {
    logger.warn('Browser was already closed');
  }

  process.exit(0);
}

process.on('SIGINT',  () => shutdown('Ctrl+C pressed'));
process.on('SIGTERM', () => shutdown('process terminated'));
process.on('uncaughtException', async err => {
  logger.error('Uncaught exception', { error: err.message });
  await shutdown('uncaught exception');
});


function resolveConfigPath() {
  const arg = process.argv[2];

  if (arg) {
    if (!existsSync(arg)) {
      logger.error(`Config file not found: "${arg}"`);
      process.exit(1);
    }
    return arg;
  }

  const defaultPath = 'src/tasks/example-task.json';
  if (!existsSync(defaultPath)) {
    logger.error(`No config file specified and default not found: "${defaultPath}"`);
    logger.info('Usage: node src/index.js [path/to/task.json]');
    process.exit(1);
  }

  logger.info(`No config specified — using default: "${defaultPath}"`);
  return defaultPath;
}


function printBanner(config) {
  console.log('\n\x1b[35m╔══════════════════════════════════════╗');
  console.log('║       Fallen London Bot v1.0         ║');
  console.log('╚══════════════════════════════════════╝\x1b[0m\n');
  logger.info(`Task:     ${config.name}`);
  logger.info(`Location: ${config.location}`);
  logger.info(`Mode:     ${config.repeatUntilOutOfActions ? 'Run until out of actions' : `Max ${config.maxIterations} iterations`}`);
  logger.info(`Min actions to resume: ${config.minActionsToResume ?? 1}`);
  logger.info(`Headless: ${process.env.FL_HEADLESS === 'true' ? 'yes' : 'no'}`);
  console.log('');
}


async function main() {
  const configPath = resolveConfigPath();

  logger.info(`Loading config: ${configPath}`);
  const raw    = await readFile(configPath, 'utf-8');
  const config = JSON.parse(raw);

  printBanner(config);

  logger.info('Launching browser...');
  await launchBrowser();
  await createPage();

  logger.info('Logging in...');
  await login();

  logger.info('Starting bot...\n');
  await runTask(config);

  logger.success('Bot finished — all done');
  await shutdown('task complete');
}

main().catch(async err => {
  logger.error('Fatal error', { error: err.message });
  await shutdown('fatal error');
});