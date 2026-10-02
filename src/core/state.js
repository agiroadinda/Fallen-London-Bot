import { getPage } from '../browser/page.js';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/helpers.js';


export async function detectOutcome() {
  const page = getPage();

  const outcome = await page.evaluate(() => {
    const hasStoryletHeading = !!document.querySelector('h1.storylet-root__heading');
    const hasBranches        = !!document.querySelector('h2.branch__title');
    const hasGoButtons       = !!document.querySelector('button.button--go');
    const hasOnwards         = !!document.querySelector('div.buttons--storylet-exit-options button');
    const hasFeedCards       = !!document.querySelector('h2.storylet__heading');
    const hasPrimaryButton   = !!document.querySelector('button.button--primary');

    const bodyText  = document.body.textContent;
    const isSuccess = bodyText.includes('Success') || bodyText.includes('success');
    const isFailure = bodyText.includes('Failure') || bodyText.includes('failed') || bodyText.includes('Failed');

    
    if (hasFeedCards && !hasStoryletHeading) {
      return { type: 'feed', continueText: null };
    }

    
    if (hasStoryletHeading && hasBranches && hasGoButtons) {
      return { type: 'branch', continueText: null };
    }

    
    if (hasStoryletHeading && hasOnwards) {
      const btnText = document.querySelector('div.buttons--storylet-exit-options button')?.textContent?.trim();
      return {
        type:         isFailure ? 'failure' : isSuccess ? 'success' : 'narrative',
        continueText: btnText,
      };
    }

    
    if (hasStoryletHeading && !hasBranches && !hasOnwards && hasPrimaryButton) {
      const btnText = document.querySelector('button.button--primary')?.textContent?.trim();
      return { type: 'sequence', continueText: btnText };
    }

    
    if (hasStoryletHeading && !hasBranches && !hasOnwards && !hasPrimaryButton) {
      return { type: 'loading', continueText: null };
    }

    return { type: 'unknown', continueText: null };
  });

  logger.state('Outcome detected', { type: outcome.type, button: outcome.continueText });
  return outcome;
}


export async function waitForPageSettle(timeout = 10000) {
  const page  = getPage();
  const start = Date.now();

  logger.info('Waiting for page to settle...');

  let lastHTML  = '';
  let stableFor = 0;

  while (Date.now() - start < timeout) {
    const currentHTML = await page.evaluate(() =>
      document.querySelector('main, #main, [class*="content"]')?.innerHTML?.slice(0, 500) ?? ''
    );

    if (currentHTML === lastHTML) {
      stableFor += 300;
      if (stableFor >= 1200) {
        logger.success('Page settled');
        return true;
      }
    } else {
      stableFor = 0;
      lastHTML  = currentHTML;
    }

    await page.waitForTimeout(300);
  }

  logger.warn('Page settle timeout — proceeding anyway');
  return false;
}


export async function clickContinue() {
  const page = getPage();

  
  const hasExitBtn = await page.$('div.buttons--storylet-exit-options button');
  if (hasExitBtn) {
    
    await page.waitForSelector(
      'div.buttons--storylet-exit-options button:not([disabled])',
      { timeout: 10000 }
    ).catch(() => null);

    const stillDisabled = await page.$eval(
      'div.buttons--storylet-exit-options button',
      el => el.disabled
    ).catch(() => true);

    if (!stillDisabled) {
      const text = await page.$eval(
        'div.buttons--storylet-exit-options button',
        el => el.textContent.trim()
      );
      logger.action(`Clicking: "${text}"`);
      await page.click('div.buttons--storylet-exit-options button:not([disabled])');
      return;
    }
  }

  
  const hasPrimaryBtn = await page.$('button.button--primary:not([disabled])');
  if (hasPrimaryBtn) {
    const text = await page.$eval(
      'button.button--primary:not([disabled])',
      el => el.textContent.trim()
    );
    logger.action(`Clicking primary: "${text}"`);
    await page.click('button.button--primary:not([disabled])');
    return;
  }

  throw new Error('No enabled continue button found on screen');
}

export async function resolveOutcome() {
  const page    = getPage();
  const start   = Date.now();
  const timeout = 60000;

  logger.info('Resolving outcome...');

  while (Date.now() - start < timeout) {
    await waitForPageSettle();
    const outcome = await detectOutcome();

    
    if (outcome.type === 'feed') {
      logger.success('Returned to feed — outcome fully resolved');
      return outcome;
    }


    // Possessions page or other non-storylet page — treat as resolved
    const onPossessions = await page.evaluate(() => 
      !!document.querySelector('ul.items--inline .item, .quality-group__items')
    );
    if (onPossessions) {
      logger.success('Returned to Possessions — outcome resolved');
      return { type: 'feed', button: null };
    }

    
    if (outcome.type === 'branch') {
      logger.success('Branch screen reached');
      return outcome;
    }

    
    if (
      outcome.type === 'narrative' ||
      outcome.type === 'success'   ||
      outcome.type === 'failure'
    ) {
      await randomDelay(400, 800);
      await clickContinue();
      await randomDelay(400, 800);
      continue;
    }

    
    if (outcome.type === 'sequence') {
      logger.info(`Following sequence: "${outcome.continueText}"`);
      await randomDelay(400, 800);
      await clickContinue();
      await randomDelay(400, 800);
      continue;
    }

    
    if (outcome.type === 'loading') {
      await page.waitForTimeout(500);
      continue;
    }

    
    logger.warn(`Unknown screen state — waiting before retry`);
    await page.waitForTimeout(1000);
  }

  throw new Error('Timeout — could not resolve outcome after 60 seconds');
}