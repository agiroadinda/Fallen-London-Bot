import { getPage } from '../browser/page.js';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/helpers.js';
import { waitForPageSettle } from './state.js';
import { getFeedStorylets, getBranches } from './parser.js';


export async function enterStorylet(titleOrIndex) {
  const page  = getPage();
  const cards = await getFeedStorylets();

  let target;

  if (typeof titleOrIndex === 'number') {
    target = cards[titleOrIndex];
  } else {
    target = cards.find(c =>
      c.title.toLowerCase().includes(titleOrIndex.toLowerCase())
    );
  }

  if (!target) {
    throw new Error(`Storylet not found on feed: "${titleOrIndex}"`);
  }

  logger.action(`Entering storylet: "${target.title}"`);

  const bodies = await page.$$('div.storylet__body');
  const body   = bodies[target.index];

  if (!body) throw new Error(`Could not locate storylet body at index ${target.index}`);

  const button = await body.$('button.button--go');
  if (!button) throw new Error(`No Go button found in storylet: "${target.title}"`);

  await randomDelay(400, 800);
  await button.click();
  await waitForPageSettle();

  logger.success(`Entered storylet: "${target.title}"`);
}


export async function clickBranch(titleOrIndex) {
  const page     = getPage();
  const branches = await getBranches();

  let target;

  if (typeof titleOrIndex === 'number') {
    target = branches[titleOrIndex];
  } else {
    target = branches.find(b =>
      b.title.toLowerCase().includes(titleOrIndex.toLowerCase())
    );
  }

  if (!target) {
    throw new Error(`Branch not found: "${titleOrIndex}"`);
  }

  if (target.isLocked) {
    throw new Error(`Branch is locked: "${target.title}"`);
  }

  logger.action(`Clicking branch: "${target.title}"`);

  const branchEls = await page.$$('div.media.branch');
  const branchEl  = branchEls[target.index];

  if (!branchEl) throw new Error(`Could not locate branch element at index ${target.index}`);

  const button = await branchEl.$('button.button--go');
  if (!button) throw new Error(`No Go button in branch: "${target.title}"`);

  await randomDelay(600, 1200);
  await button.click();

  logger.success(`Branch clicked: "${target.title}"`);
}