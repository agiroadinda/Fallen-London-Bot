import { getPage } from '../browser/page.js';
import { logger } from '../utils/logger.js';

export async function getScreenState() {
  const page = getPage();

  const state = await page.evaluate(() => {
    const hasStoryletHeading = !!document.querySelector('h1.storylet-root__heading');
    const hasBranches        = !!document.querySelector('h2.branch__title');
    const hasGoButtons       = !!document.querySelector('button.button--go');
    const hasOnwards         = !!document.querySelector('div.buttons--storylet-exit-options button');
    const hasFeedCards       = !!document.querySelector('h2.storylet__heading');

    if (hasFeedCards && !hasStoryletHeading)               return 'feed';
    if (hasStoryletHeading && hasOnwards && !hasBranches)  return 'narrative';
    if (hasStoryletHeading && hasBranches && hasGoButtons) return 'branch';
    if (hasStoryletHeading && !hasBranches && !hasOnwards) return 'loading';

    const hasPossessions = !!document.querySelector('ul.items--inline .item, .quality-group__items');
    if (hasPossessions) return 'feed';
    
    return 'unknown';
  });

  logger.state('Screen state', { state });
  return state;
}

export async function getStorylet() {
  const page = getPage();

  const storylet = await page.evaluate(() => {
    const heading     = document.querySelector('h1.storylet-root__heading');
    const description = document.querySelector('p.storylet-root__description-container');
    if (!heading) return null;
    return {
      title:       heading.textContent.trim(),
      description: description ? description.textContent.trim().slice(0, 120) : '',
    };
  });

  if (storylet) {
    logger.state('Storylet detected', { title: storylet.title });
  }

  return storylet;
}

export async function getBranches() {
  const page = getPage();

  const branches = await page.evaluate(() => {
    const results = [];

    document.querySelectorAll('div.media.branch').forEach((branch, index) => {
      const titleEl  = branch.querySelector('h2.branch__title');
      const buttonEl = branch.querySelector('button.button--go');
      if (!titleEl || !buttonEl) return;

      const title        = titleEl.textContent.trim();
      const buttonText   = buttonEl.textContent.trim();
      const isFreeAction = buttonText === 'Go (0)';

      
      const isLocked = buttonEl.disabled ||
                       buttonEl.classList.contains('button--disabled') ||
                       buttonText.includes('Not enough');

      results.push({ index, title, buttonText, isLocked, isFreeAction });
    });

    return results;
  });

  logger.state('Branches found', { count: branches.length });
  branches.forEach(b => {
    const tag = b.isLocked ? 'LOCKED' : b.isFreeAction ? 'FREE (0)' : 'available';
    logger.info(`  [${b.index}] "${b.title}" — ${tag}`);
  });

  return branches;
}

export async function getFeedStorylets() {
  const page = getPage();

  const cards = await page.evaluate(() => {
    const results = [];

    document.querySelectorAll('div.storylet__body').forEach((body, index) => {
      const titleEl  = body.querySelector('h2.storylet__heading');
      const buttonEl = body.querySelector('button.button--go');
      if (!titleEl || !buttonEl) return;

      results.push({
        index,
        title:      titleEl.textContent.trim(),
        buttonText: buttonEl.textContent.trim(),
        isLocked:   buttonEl.disabled || buttonEl.classList.contains('button--disabled'),
      });
    });

    return results;
  });

  logger.state('Feed storylets found', { count: cards.length });
  cards.forEach(c => logger.info(`  [${c.index}] "${c.title}" — ${c.isLocked ? 'LOCKED' : 'available'}`));

  return cards;
}

export async function getOnwardsButton() {
  const page = getPage();
  return page.evaluate(() => !!document.querySelector('div.buttons--storylet-exit-options button'));
}

export async function getActionCount() {
  const page = getPage();

  const count = await page.evaluate(() => {
    const el = document.querySelector('section.player-actions');
    if (!el) return null;
    const match = el.textContent.match(/(\d+)\s+of\s+\d+/);
    return match ? parseInt(match[1], 10) : null;
  });

  logger.info('Action points', { count });
  return count;
}

export async function waitForScreenState(expectedState, timeout = 15000) {
  const page  = getPage();
  const start = Date.now();

  logger.info(`Waiting for screen state: ${expectedState}`);

  while (Date.now() - start < timeout) {
    const current = await getScreenState();
    if (current === expectedState) {
      logger.success(`Screen state reached: ${expectedState}`);
      return true;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Timeout waiting for screen state: ${expectedState}`);
}

export async function getCurrentLocation() {
  const page = getPage();

  const locationText = await page.evaluate(() => {
    const el = document.querySelector('h1.welcome');
    if (!el) return null;
    const match = el.textContent.match(/Welcome to (.+?),\s*delicious/i);
    return match ? match[1].trim() : null;
  });

  logger.info('Current location', { location: locationText });
  return locationText;
}

export async function waitForActions(minActions = 1, timeout = 7200000) {
  const page  = getPage();
  const start = Date.now();

  logger.info(`Waiting for action points to reach ${minActions}...`);

  while (Date.now() - start < timeout) {
    const actions = await getActionCount();

    if (actions >= minActions) {
      logger.success(`Action points ready: ${actions}`);
      return actions;
    }

    const nextAction = await page.evaluate(() => {
      const text  = document.querySelector('section.player-actions')?.textContent;
      const match = text?.match(/Next action at (\d+:\d+)/);
      return match ? match[1] : null;
    });

    logger.info(`Actions: ${actions}/${minActions} needed — next at ${nextAction ?? 'unknown'} — waiting 60s...`);
    await page.waitForTimeout(60000);
  }

  throw new Error('Timed out waiting for action points to refill');
}

export async function travelToLocation(locationName) {
  const page = getPage();

  logger.info(`Travelling to: "${locationName}"`);

  const travelled = await page.evaluate((name) => {
    const buttons = [...document.querySelectorAll('button')];
    const target  = buttons.find(b =>
      b.textContent.trim().toLowerCase() === name.toLowerCase()
    );
    if (target) { target.click(); return true; }
    return false;
  }, locationName);

  if (!travelled) {
    logger.warn(`Location button not found: "${locationName}"`);
    return false;
  }

  logger.success(`Travelled to: "${locationName}"`);
  return true;
}


export async function getQualityValue(qualityName) {
  const page = getPage();

  const nameLower = qualityName.toLowerCase();

  // First try sidebar — always visible
  const sidebarValue = await page.evaluate((name) => {
    const items = [...document.querySelectorAll('.js-item.item.sidebar-quality')];
    for (const el of items) {
      const itemName = el.querySelector('.js-item-name')?.textContent?.trim() ?? '';
      if (itemName.toLowerCase().includes(name)) {
        const val = el.querySelector('.item__value')?.textContent?.trim();
        const num = val?.match(/[\d,]+/);
        return num ? parseInt(num[0].replace(',', ''), 10) : null;
      }
    }
    return null;
  }, nameLower);

  if (sidebarValue !== null) {
    logger.info(`Quality check: "${qualityName}" = ${sidebarValue} (sidebar)`);
    return sidebarValue;
  }

  // Not in sidebar — navigate to Myself tab to check
  logger.info(`"${qualityName}" not in sidebar — checking Myself tab...`);

  await page.goto('https://www.fallenlondon.com/myself', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('span.js-item-name.quality-item__name', { timeout: 10000 }).catch(() => null);

  //await page.waitForSelector('span.js-item-name.quality-item__name', { timeout: 10000 }).catch(() => null);

  const myselfValue = await page.evaluate((name) => {
    const items = [...document.querySelectorAll('span.js-item-name.quality-item__name')];
    for (const el of items) {
      const fullText = el.textContent.trim();
      if (fullText.toLowerCase().includes(name)) {
        const numMatch = fullText.match(/(\d[\d,]*)\s*(?:\/\d+)?(?:\s*[-–]|$)/);
        return numMatch ? parseInt(numMatch[1].replace(',', ''), 10) : null;
      }
    }
    return null;
  }, nameLower);

  // Navigate back to Story tab
  
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.waitForSelector('button.button--go', { timeout: 10000 }).catch(() => null);

  if (myselfValue !== null) {
    logger.info(`Quality check: "${qualityName}" = ${myselfValue} (myself tab)`);
    return myselfValue;
  }

  logger.info(`"${qualityName}" not on Myself tab — checking Possessions...`);

  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const poss = links.find(el => el.textContent.trim() === 'Possessions');
    if (poss) poss.click();
  });

  await page.waitForTimeout(2000);
  await page.waitForSelector('ul.items--inline .item', { timeout: 10000 }).catch(() => null);

  // Use inventory search to filter
  await page.evaluate((name) => {
    const inputs = [...document.querySelectorAll('input.form__control.input--item-search')];
    const inventorySearch = inputs.find(el => !el.id);
    if (inventorySearch) {
      const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputSetter.call(inventorySearch, name);
      inventorySearch.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, qualityName);

  await page.waitForTimeout(1500);


  const possValue = await page.evaluate((name) => {
    const items = [...document.querySelectorAll('ul.items--inline .item')];
    const match = items.find(el => {
      const label = el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
      const itemNameFromLabel = label.split(';')[0].trim().toLowerCase();
      return itemNameFromLabel.includes(name) || name.includes(itemNameFromLabel);
    });
    if (!match) return null;
    const label = match.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
    const quantMatch = label.match(/×\s*([\d,]+)/);
    return quantMatch ? parseInt(quantMatch[1].replace(',', ''), 10) : null;
  }, nameLower);


  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input.form__control.input--item-search')];
    const inventorySearch = inputs.find(el => !el.id);
    if (inventorySearch) {
      const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputSetter.call(inventorySearch, '');
      inventorySearch.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }).catch(() => null);

  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const story = links.find(el => el.textContent.trim() === 'Story');
    if (story) story.click();
  });

  await page.waitForTimeout(1000);

  logger.info(`Quality check: "${qualityName}" = ${possValue ?? 'not found'} (possessions tab)`);
  return possValue;
}


export async function getItemValue(itemName) {
  const page = getPage();

  const nameLower = itemName.toLowerCase();

  const value = await page.evaluate((name) => {
    const items = [...document.querySelectorAll('.available-item-list__item')];
    const match = items.find(el => {
      const label = el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
      const itemNameFromLabel = label.split(';')[0].trim().toLowerCase();
      return itemNameFromLabel.includes(name) || name.includes(itemNameFromLabel);
    });
    if (!match) return null;
    const val = match.querySelector('.js-item-value')?.textContent?.trim();
    const num = val?.replace(',', '');
    return num ? parseInt(num, 10) : null;
  }, nameLower);

  logger.info(`Item check: "${itemName}" = ${value ?? 'not found'}`);
  return value;
}