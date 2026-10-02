import { getPage } from '../browser/page.js';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/helpers.js';
import { waitForPageSettle } from './state.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLACKLIST_PATH = path.join(__dirname, '../../src/equipment/equipment-blacklist.json');

function loadBlacklist() {
  try {
    const raw = fs.readFileSync(BLACKLIST_PATH, 'utf-8');
    return JSON.parse(raw).blacklist ?? [];
  } catch {
    return [];
  }
}

function parseStats(ariaLabel) {
  const stats = {};
  const parts = ariaLabel.split(';');
  for (const part of parts.slice(1)) {
    const match = part.trim().match(/^(.+?)\s*([+-]\d+)$/);
    if (match) {
      const statName = match[1].trim().toLowerCase();
      const value    = parseInt(match[2], 10);
      stats[statName] = (stats[statName] ?? 0) + value;
    }
  }
  return stats;
}

async function getEquipmentSlots() {
  const page = getPage();

  const slots = await page.evaluate(() => {
    const results = [];
    const slotContainers = [...document.querySelectorAll('.equipment-slot, [class*="equipment"] li, .possessions-group')];

    document.querySelectorAll('.available-item-list').forEach(list => {
      const parent  = list.closest('div, section, li');
      const heading = parent?.querySelector('h2, h3')?.textContent?.trim()
        ?? parent?.previousElementSibling?.textContent?.trim()
        ?? 'Unknown';

      const items = [...list.querySelectorAll('.available-item-list__item')].map(el => {
        const label     = el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
        const qualityId = el.querySelector('[data-quality-id]')?.dataset?.qualityId;
        return { label, qualityId };
      });

      if (items.length > 0) results.push({ heading, items });
    });

    return results;
  });

  return slots;
}

export async function equipMaxStat(targetStats, blacklist = []) {
  const page      = getPage();
  const allBlacklist = [...loadBlacklist(), ...blacklist];

  logger.info(`Equipping to maximise: ${Array.isArray(targetStats) ? targetStats.join(' + ') : targetStats}`);

  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const poss  = links.find(el => el.textContent.trim() === 'Possessions');
    if (poss) poss.click();
  });

  await page.waitForTimeout(2000);
  await page.waitForSelector('.available-item-list__item', { timeout: 10000 }).catch(() => null);

  const slots = await getEquipmentSlots();
  const statsToMax = Array.isArray(targetStats)
    ? targetStats.map(s => s.toLowerCase())
    : [targetStats.toLowerCase()];

  for (const slot of slots) {
    let bestItem     = null;
    let bestScore    = -Infinity;

    for (const item of slot.items) {
      const name = item.label.split(';')[0].trim();
      if (allBlacklist.some(b => name.toLowerCase().includes(b.toLowerCase()))) {
        logger.info(`Skipping blacklisted item: "${name}"`);
        continue;
      }

      const stats = parseStats(item.label);
      const score = statsToMax.reduce((sum, stat) => sum + (stats[stat] ?? 0), 0);

      if (score > bestScore) {
        bestScore = score;
        bestItem  = { name, qualityId: item.qualityId, score };
      }
    }

    if (bestItem && bestItem.score > 0) {
      logger.action(`Slot "${slot.heading}": equipping "${bestItem.name}" (${statsToMax.join('+')} score: ${bestItem.score})`);

      const clicked = await page.evaluate((qualityId) => {
        const items = [...document.querySelectorAll('.available-item-list__item')];
        const match = items.find(el =>
          el.querySelector('[data-quality-id]')?.dataset?.qualityId === qualityId
        );
        if (!match) return false;
        const btn = match.querySelector('[role="button"]');
        if (btn) { btn.click(); return true; }
        return false;
      }, bestItem.qualityId);

      if (clicked) {
        await randomDelay(300, 600);
        
        // Handle EQUIP modal if it appears
        const modal = await page.$('.ReactModal__Content, .ReactModal__Overlay');
        if (modal) {
          const equipBtn = await page.$('.ReactModal__Content button:not([disabled])');
          if (equipBtn) {
            const btnText = await page.evaluate(b => b.textContent.trim(), equipBtn);
            logger.action(`Clicking modal button: "${btnText}"`);
            await equipBtn.click();
            await randomDelay(300, 500);
          }
        }
      } else {
        logger.warn(`Could not click item: "${bestItem.name}"`);
      }
    } else {
      logger.info(`Slot "${slot.heading}": no improvement found — keeping current`);
    }
  }

  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const story = links.find(el => el.textContent.trim() === 'Story');
    if (story) story.click();
  });

  await page.waitForTimeout(1000);
  await waitForPageSettle();
  logger.success('Equipment optimised — returned to Story');
}

export async function equipOutfit(outfitName) {
  const page = getPage();

  logger.info(`Equipping outfit: "${outfitName}"`);

  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const poss  = links.find(el => el.textContent.trim() === 'Possessions');
    if (poss) poss.click();
  });

  await page.waitForTimeout(2000);
  await page.waitForSelector('#a11y-outfit-dropdown', { timeout: 10000 }).catch(() => null);

  const selected = await page.evaluate((name) => {
    const select  = document.querySelector('#a11y-outfit-dropdown');
    if (!select) return false;
    const option  = [...select.options].find(o =>
      o.textContent.trim().toLowerCase().includes(name.toLowerCase())
    );
    if (!option) return false;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value'
    ).set;
    nativeSetter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return option.textContent.trim();
  }, outfitName);

  if (selected) {
    logger.success(`Outfit selected: "${selected}"`);
    await page.waitForTimeout(1500);
  } else {
    logger.warn(`Outfit not found: "${outfitName}"`);
  }

  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const story = links.find(el => el.textContent.trim() === 'Story');
    if (story) story.click();
  });

  await page.waitForTimeout(1000);
  await waitForPageSettle();
  logger.success('Outfit equipped — returned to Story');
}

export async function handleEquipment(equipConfig) {
  if (!equipConfig || equipConfig.mode === 'none') return;

  if (equipConfig.mode === 'maximise') {
    await equipMaxStat(equipConfig.stats);
    return;
  }

  if (equipConfig.mode === 'outfit') {
    await equipOutfit(equipConfig.outfit);
    return;
  }
}