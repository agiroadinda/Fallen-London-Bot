import { getPage } from '../browser/page.js';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/helpers.js';
import { waitForPageSettle } from './state.js';
import { getScreenState } from './parser.js';
import { resolveOutcome } from './state.js';
import { handleEquipment } from './equipment.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, '../../src/cards/card-database.json');

function loadCardDatabase() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw).cards ?? [];
  } catch {
    logger.warn('Card database not found or invalid — using empty database');
    return [];
  }
}

function findCardConfig(cardName, database) {
  return database.find(c =>
    cardName.toLowerCase().includes(c.name.toLowerCase()) ||
    c.name.toLowerCase().includes(cardName.toLowerCase())
  );
}

export async function getHandCards() {
  const page = getPage();

  const cards = await page.evaluate(() => {
    return [...document.querySelectorAll('.hand__card-container')].map(container => {
      const name        = container.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
      const borderStyle = container.querySelector('.hand__border')?.style?.backgroundImage ?? '';
      const eventId     = container.dataset.eventId;
      const hasDiscard  = !!container.querySelector('button.card__discard-button');

      let borderType = 'unspecialised';
      if (borderStyle.includes('Card-Fancy'))    borderType = 'fancy';
      if (borderStyle.includes('Card-Premium'))  borderType = 'premium';
      if (borderStyle.includes('Card-Ongoing'))  borderType = 'ongoing';

      return { name, eventId, borderType, hasDiscard };
    });
  });

  logger.info(`Cards in hand: ${cards.length}`);
  cards.forEach(c => logger.info(`  "${c.name}" — ${c.borderType}${c.hasDiscard ? '' : ' (undiscardable)'}`));

  return cards;
}

export async function getDeckCount() {
  const page = getPage();

  const result = await page.evaluate(() => {
    const el = document.querySelector('.deck-info__cards-in-deck span');
    if (!el) return { count: 0, infinite: false };
    const text = el.textContent.trim();
    if (text.toLowerCase().includes('no draw limit')) return { count: 999, infinite: true };
    const match = text.match(/x(\d+)/i);
    return { count: match ? parseInt(match[1], 10) : 0, infinite: false };
  });

  logger.info(`Cards in deck: ${result.infinite ? 'unlimited' : result.count}`);
  return result;
}

export async function drawCard() {
  const page = getPage();

  const deckExists = await page.$('button.deck');
  if (!deckExists) {
    logger.warn('No deck button found');
    return false;
  }

  const { count, infinite } = await getDeckCount();
  if (!infinite && count === 0) {
    logger.warn('Deck is empty — not drawing to avoid spending Fate');
    return false;
  }

  // Close any open modal first
  await page.evaluate(() => {
    const overlay = document.querySelector('.ReactModal__Overlay');
    if (overlay) {
      const closeBtn = overlay.querySelector('button[class*="close"], .modal__close');
      if (closeBtn) closeBtn.click();
    }
  }).catch(() => null);
  await randomDelay(300, 500);

  const { getActionCount } = await import('./parser.js');
  const actions = await getActionCount();
  if (actions === 0) {
    logger.warn('Out of actions — cannot draw card — waiting for refill...');
    const { waitForActions } = await import('./parser.js');
    await waitForActions(1);
  }
  logger.action('Drawing a card from deck...');
  await page.click('button.deck');
  await randomDelay(800, 1200);
  await waitForPageSettle();
  return true;
}

export async function clickCard(cardName) {
  const page = getPage();

  const clicked = await page.evaluate((name) => {
    const containers = [...document.querySelectorAll('.hand__card-container')];
    const container  = containers.find(c =>
      c.querySelector('[aria-label]')?.getAttribute('aria-label')?.toLowerCase().includes(name.toLowerCase())
    );
    if (!container) return false;
    const btn = container.querySelector('[role="button"]');
    if (btn) { btn.click(); return true; }
    return false;
  }, cardName);

  if (!clicked) {
    logger.warn(`Card not found in hand: "${cardName}"`);
    return false;
  }

  logger.action(`Clicked card: "${cardName}"`);
  await randomDelay(500, 1000);
  await waitForPageSettle();

  // Check if a modal/tooltip appeared with a PLAY button
  const playBtn = await page.$('button.btn--go, button[class*="play"], .ReactModal__Content button');
  if (playBtn) {
    const playText = await page.evaluate(b => b.textContent.trim(), playBtn);
    if (playText.toLowerCase().includes('play') || playText.toLowerCase() === 'go') {
      logger.action(`Clicking play button in card modal: "${playText}"`);
      await playBtn.click();
      await randomDelay(500, 1000);
      await waitForPageSettle();
    }
  }

  return true;
}

export async function discardCard(cardName) {
  const page = getPage();

  const discarded = await page.evaluate((name) => {
    const containers = [...document.querySelectorAll('.hand__card-container')];
    const container  = containers.find(c =>
      c.querySelector('[aria-label]')?.getAttribute('aria-label')?.toLowerCase().includes(name.toLowerCase())
    );
    if (!container) return false;
    const btn = container.querySelector('button.card__discard-button');
    if (btn) { btn.click(); return true; }
    return false;
  }, cardName);

  if (discarded) {
    logger.success(`Discarded card: "${cardName}"`);
    await randomDelay(400, 800);
  } else {
    logger.warn(`Could not discard card: "${cardName}" — may be undiscardable`);
  }

  return discarded;
}

export async function playCard(cardName, branchName, equipConfig = null) {
  const clicked = await clickCard(cardName);
  if (!clicked) return false;

  await waitForPageSettle();
  await randomDelay(500, 1000);
  await waitForPageSettle();
  const state = await getScreenState();

  if (state !== 'branch') {
    logger.warn(`Expected branch screen after clicking card — got: ${state}`);
    const page = getPage();
    const exitBtn = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
    if (exitBtn) await page.click('div.buttons--storylet-exit-options button:not([disabled])');
    return false;
  }

  const page     = getPage();
  const branches = await page.evaluate(() => {
    return [...document.querySelectorAll('h2.branch__title')].map((h, i) => ({
      index: i,
      title: h.textContent.trim(),
    }));
  });

  const branchNames = Array.isArray(branchName) ? branchName : [branchName];
  let target = null;

  for (const name of branchNames) {
    const found = branches.find(b =>
      b.title.toLowerCase().includes(name.toLowerCase())
    );
    if (found) {
      const branchEls = await page.$$('div.media.branch');
      const branchEl  = branchEls[found.index];
      const button    = await branchEl?.$('button.button--go:not([disabled])');
      if (button) {
        target = { branch: found, button };
        break;
      } else {
        logger.info(`Branch found but locked: "${name}" — trying next...`);
      }
    } else {
      logger.info(`Branch not found in card: "${name}" — trying next...`);
    }
  }

  if (!target) {
    logger.warn(`No available branch found in card: "${cardName}" — exiting`);
    const exitBtn = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
    if (exitBtn) await page.click('div.buttons--storylet-exit-options button:not([disabled])');
    return 'locked';
  }

  const { getActionCount } = await import('./parser.js');
  const actions = await getActionCount();
  if (actions === 0) {
    logger.warn('Out of actions — cannot play card branch — waiting for refill...');
    const { waitForActions } = await import('./parser.js');
    await waitForActions(1);
  }


  if (equipConfig) {
    await handleEquipment(equipConfig);
    await waitForPageSettle();

    // Re-fetch branch button after navigation — old handle is stale
    const page        = getPage();
    const freshBranches = await page.evaluate(() => {
      return [...document.querySelectorAll('h2.branch__title')].map((h, i) => ({
        index: i,
        title: h.textContent.trim(),
      }));
    });
    const freshTarget = freshBranches.find(b =>
      b.title.toLowerCase().includes(target.branch.title.toLowerCase())
    );
    if (freshTarget) {
      const branchEls = await page.$$('div.media.branch');
      const branchEl  = branchEls[freshTarget.index];
      const freshBtn  = await branchEl?.$('button.button--go:not([disabled])');
      if (freshBtn) target.button = freshBtn;
    }
  }

  logger.action(`Playing card branch: "${target.branch.title}"`);
  await randomDelay(600, 1200);
  await target.button.click();
  await randomDelay(500, 1000);

  const outcome = await resolveOutcome();
  logger.success(`Card played: "${cardName}" — outcome: ${outcome.type}`);
  return true;
}


async function checkCardCondition(condition) {
  if (!condition) return true;
  const { getQualityValue } = await import('./parser.js');
  const value = await getQualityValue(condition.quality);
  if (value === null) {
    logger.warn(`Card condition quality not found: "${condition.quality}" — skipping`);
    return false;
  }
  const { operator, value: threshold } = condition;
  const result =
    operator === 'above'    ? value >  threshold :
    operator === 'below'    ? value <  threshold :
    operator === 'equals'   ? value === threshold :
    operator === 'at_least' ? value >= threshold :
    operator === 'at_most'  ? value <= threshold :
    true;
  logger.info(`Card condition: "${condition.quality}" ${operator} ${threshold} — current: ${value} — ${result ? 'PASS' : 'FAIL'}`);
  return result;
}



export async function processHand(forceFallback = false, autoPlayPriority = null) {
  const database  = loadCardDatabase();
  const cards     = await getHandCards();
  const lockedSet = new Set();

  if (cards.length === 0) {
    logger.info('Hand is empty');
    return { played: 0, discarded: 0, held: 0 };
  }

  let played = 0, discarded = 0, held = 0;
  const heldCards = [];

  for (const card of cards) {
    const config = findCardConfig(card.name, database);

    if (!config) {
      logger.info(`No config for card: "${card.name}" — holding`);
      heldCards.push({ card, config: null });
      held++;
      continue;
    }

    if (config.action === 'discard') {
      const ok = await discardCard(card.name);
      if (ok) discarded++;
      else { heldCards.push({ card, config }); held++; }
      continue;
    }

    if (config.action === 'play') {
      // Support both single branch and branches array
      if (config.branches && config.branches.length > 0) {
        const sorted = [...config.branches].sort((a, b) => a.priority - b.priority);
        let played_this = false;

        const eligibleBranches = [];
        for (const entry of sorted) {
          if (entry.condition) {
            const conditionMet = await checkCardCondition(entry.condition);
            if (!conditionMet) {
              logger.info(`Branch condition not met: "${entry.branch}" — skipping`);
              continue;
            }
          }
          if (autoPlayPriority !== null && entry.priority != null && entry.priority > autoPlayPriority) {
            logger.info(`Branch priority ${entry.priority} above threshold — skipping`);
            continue;
          }
          eligibleBranches.push(entry.branch);
        }

        if (eligibleBranches.length > 0) {
          const result = await playCard(card.name, eligibleBranches, config.equipment ?? null);
          if (result === true) { played++; played_this = true; }
          else if (result === 'locked') lockedSet.add(card.name);
        }

        if (!played_this) {
          heldCards.push({ card, config });
          held++;
        }
        continue;
      }

      if (config.branch) {
        if (config.condition) {
          const conditionMet = await checkCardCondition(config.condition);
          if (!conditionMet) {
            logger.info(`Card condition not met for: "${card.name}" — holding`);
            heldCards.push({ card, config });
            held++;
            continue;
          }
        }
        if (autoPlayPriority !== null && config.priority != null && config.priority > autoPlayPriority) {
          logger.info(`Card "${card.name}" priority ${config.priority} above auto-play threshold ${autoPlayPriority} — holding until hand full`);
          heldCards.push({ card, config });
          held++;
          continue;
        }
        const result = await playCard(card.name, config.branch, config.equipment ?? null);
        if (result === true) played++;
        else if (result === 'locked') {
          lockedSet.add(card.name);
          heldCards.push({ card, config });
          held++;
        } else {
          heldCards.push({ card, config });
          held++;
        }
        continue;
      }
    }

    if (config.action === 'hold') {
      logger.info(`Holding card: "${card.name}"${config.priority ? ` (priority ${config.priority})` : ''}`);
      heldCards.push({ card, config });
      held++;
      continue;
    }
  }

  if (forceFallback && played === 0 && discarded === 0 && heldCards.length > 0) {
    logger.info('Hand full with no actionable cards — using priority fallback...');

    const priorityCards = heldCards
      .filter(h => h.config?.priority != null && h.config?.branch && !lockedSet.has(h.card.name))
      .sort((a, b) => a.config.priority - b.config.priority);

    if (priorityCards.length > 0) {
      const best = priorityCards[0];
      logger.info(`Fallback: playing priority ${best.config.priority} card: "${best.card.name}"`);
      const result = await playCard(best.card.name, best.config.branch, best.config.equipment ?? null);
      if (result === true) { played++; held--; }
    } else {
      logger.warn('No priority cards available for fallback — hand is stuck');
    }
  }

  logger.success(`Hand processed — played: ${played}, discarded: ${discarded}, held: ${held}`);
  return { played, discarded, held };
}

export async function runCardDraw(step) {
  const { mode, count, autoPlayPriority } = step;

  logger.info(`Running card draw — mode: ${mode}${mode === 'finite' ? `, count: ${count}` : ''}${autoPlayPriority ? `, auto-play priority ≤ ${autoPlayPriority}` : ''}`);

  if (mode === 'infinite') {
    let noProgressCount = 0;
    while (true) {
      await processHand(false, autoPlayPriority);
      const drew = await drawCard();
      if (!drew) break;
      await waitForPageSettle();
      const result = await processHand(true, autoPlayPriority);
      if (result.played === 0 && result.discarded === 0) {
        noProgressCount++;
        if (noProgressCount >= 3) {
          logger.info('No actionable cards after 3 draws — stopping infinite draw');
          break;
        }
      } else {
        noProgressCount = 0;
      }
    }
    return;
  }

  if (mode === 'finite') {
    let drawn = 0;
    while (drawn < count) {
      const { count: deckCount, infinite } = await getDeckCount();
      if (!infinite && deckCount === 0) {
        logger.warn(`Deck empty after ${drawn} draws — stopping`);
        break;
      }
      const drew = await drawCard();
      if (!drew) break;
      drawn++;
      await waitForPageSettle();
      await processHand(false, autoPlayPriority);
    }
    await processHand(true, autoPlayPriority);
    return;
  }
}


export async function useInventoryItem(itemName, branchName) {
  const page = getPage();

  logger.info(`Using inventory item: "${itemName}"`);

  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const poss  = links.find(el => el.textContent.trim() === 'Possessions');
    if (poss) poss.click();
  });

  await page.waitForTimeout(2000);

  const possLoaded = await page.waitForSelector('.quality-group__items .item', { timeout: 10000 }).catch(() => null);
  if (!possLoaded) {
    logger.warn('Possessions inventory section did not load — trying page.goto');
    await page.goto('https://www.fallenlondon.com/possessions', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.waitForSelector('.quality-group__items .item', { timeout: 10000 }).catch(() => null);
  }

  const itemCount = await page.evaluate(() => 
    document.querySelectorAll('ul.items--inline .item').length
  );
  logger.info(`Inventory items visible: ${itemCount}`);

  // Type into the inventory search box
  const searchFilled = await page.evaluate((name) => {
    const inputs = [...document.querySelectorAll('input.form__control.input--item-search')];
    const inventorySearch = inputs.find(el => !el.id);
    if (!inventorySearch) return false;
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputSetter.call(inventorySearch, name);
    inventorySearch.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, itemName);

  if (!searchFilled) {
    logger.warn('Could not find inventory search box');
  } else {
    await page.waitForTimeout(1500);
  }

  const debugInfo = await page.evaluate((name) => {
    const items = [...document.querySelectorAll('ul.items--inline .item')];
    const firstFew = items.slice(0, 5).map(el =>
      el.querySelector('[aria-label]')?.getAttribute('aria-label')?.slice(0, 80) ?? 'no label'
    );
    return { count: items.length, firstFew };
  }, itemName);

  logger.info(`Inventory debug — count: ${debugInfo.count}, first items: ${JSON.stringify(debugInfo.firstFew)}`);

  const clicked = await page.evaluate((name) => {
    const items = [...document.querySelectorAll('ul.items--inline .item')];
    const match = items.find(el => {
      const label = el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
      const itemNameFromLabel = label.split(/\s*[×x]\s*/)[0].trim().toLowerCase();
      return itemNameFromLabel.includes(name.toLowerCase()) ||
            name.toLowerCase().includes(itemNameFromLabel);
    });
    if (!match) return false;
    const btn = match.querySelector('[role="button"]');
    if (btn) { btn.click(); return true; }
    return false;
  }, itemName);

  // Clear search
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input.form__control.input--item-search')];
    const inventorySearch = inputs.find(el => !el.id);
    if (inventorySearch) {
      const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputSetter.call(inventorySearch, '');
      inventorySearch.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }).catch(() => null);

  if (!clicked) {
    logger.warn(`Item not found in Possessions: "${itemName}"`);
    await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      const story = links.find(el => el.textContent.trim() === 'Story');
      if (story) story.click();
    });
    await page.waitForTimeout(1000);
    return false;
  }

  logger.action(`Clicked item: "${itemName}"`);
  await page.waitForTimeout(500);
  await waitForPageSettle();

  // Handle modal popup if it appears
  const modal = await page.$('.ReactModal__Content, .ReactModal__Overlay');
  if (modal) {
    logger.info('Modal detected after clicking item — looking for action button...');
    const actionBtn = await page.$('.ReactModal__Content button:not([disabled])');
    if (actionBtn) {
      const btnText = await page.evaluate(b => b.textContent.trim(), actionBtn);
      logger.action(`Clicking modal button: "${btnText}"`);
      await actionBtn.click();
      await page.waitForTimeout(500);
      await waitForPageSettle();
    }
  }

  await page.waitForTimeout(500);
  await waitForPageSettle();

  const state = await getScreenState();

  if (state !== 'branch') {
    logger.warn(`Expected branch screen after clicking item — got: ${state}`);
    await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      const story = links.find(el => el.textContent.trim() === 'Story');
      if (story) story.click();
    });
    await page.waitForTimeout(1000);
    return false;
  }

  const branches = await page.evaluate(() => {
    return [...document.querySelectorAll('h2.branch__title')].map((h, i) => ({
      index: i,
      title: h.textContent.trim(),
    }));
  });

  const target = branches.find(b =>
    b.title.toLowerCase().includes(branchName.toLowerCase())
  );

  if (!target) {
    logger.warn(`Branch not found in item: "${branchName}" — exiting`);
    const exitBtn = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
    if (exitBtn) await page.click('div.buttons--storylet-exit-options button:not([disabled])');
    return false;
  }

  const branchEls = await page.$$('div.media.branch');
  const branchEl  = branchEls[target.index];
  const button    = await branchEl?.$('button.button--go:not([disabled])');

  if (!button) {
    logger.warn(`Branch locked: "${branchName}" — exiting`);
    const exitBtn = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
    if (exitBtn) await page.click('div.buttons--storylet-exit-options button:not([disabled])');
    return false;
  }

  logger.action(`Using item branch: "${target.title}"`);
  await randomDelay(600, 1200);
  await button.click();
  await randomDelay(500, 1000);

  const outcome = await resolveOutcome();
  logger.success(`Item used: "${itemName}" — outcome: ${outcome.type}`);
  return true;
}