import 'dotenv/config';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/helpers.js';
import {
  getScreenState,
  getFeedStorylets,
  getBranches,
  getActionCount,
  getCurrentLocation,
  getStorylet,
  waitForActions,
  getQualityValue,
} from './parser.js';
import { enterStorylet } from './executor.js';
import { resolveOutcome, waitForPageSettle } from './state.js';
import { validateTask } from '../tasks/schema.js';
import { getPage } from '../browser/page.js';
//import { runCardDraw } from './cards.js';
import { runCardDraw, useInventoryItem } from './cards.js';
import { handleEquipment } from './equipment.js';


async function returnToFeed(storyletConfigs = [], minActionsToResume = 1) {
  await waitForPageSettle();

  let state = await getScreenState();
  if (state === 'feed') return;

  logger.info(`Not on feed (state: ${state}) — resolving...`);

  const page    = getPage();
  const start   = Date.now();
  const timeout = 7200000;

  while (Date.now() - start < timeout) {
    await waitForPageSettle();
    state = await getScreenState();

    if (state === 'feed') {
      logger.success('Returned to feed');
      return;
    }

    
    const hasExitBtn = await page.$('div.buttons--storylet-exit-options button');
    if (hasExitBtn) {
      await page.waitForSelector(
        'div.buttons--storylet-exit-options button:not([disabled])',
        { timeout: 10000 }
      ).catch(() => null);

      const isDisabled = await page.$eval(
        'div.buttons--storylet-exit-options button',
        el => el.disabled
      ).catch(() => true);

      if (!isDisabled) {
        const text = await page.$eval(
          'div.buttons--storylet-exit-options button',
          el => el.textContent.trim()
        );
        logger.action(`Clicking exit: "${text}"`);
        await page.click('div.buttons--storylet-exit-options button:not([disabled])');
        await randomDelay(400, 800);
        continue;
      }

      await page.waitForTimeout(500);
      continue;
    }

    
    if (state === 'branch') {
      const branches  = await getBranches();
      const available = branches.filter(b => !b.isLocked);
      const currentStorylet = await getStorylet();

      if (available.length > 0) {
        let branchToClick    = null;
        let matchingConfig   = null;

        if (storyletConfigs.length > 0 && currentStorylet) {
          matchingConfig = storyletConfigs.find(s =>
            s.target && currentStorylet.title.toLowerCase().includes(s.target.toLowerCase())
          );

          if (matchingConfig) {
            if (matchingConfig.branch) {
              const match = available.find(b =>
                b.title.toLowerCase().includes(matchingConfig.branch.toLowerCase())
              );
              if (match) branchToClick = match;
            }

            if (!branchToClick && matchingConfig.branches) {
              const sorted = [...matchingConfig.branches].sort((a, b) => a.priority - b.priority);
              for (const entry of sorted) {
                const match = available.find(b =>
                  b.title.toLowerCase().includes(entry.branch.toLowerCase())
                );
                if (match) { branchToClick = match; break; }
              }
            }

            if (!branchToClick && matchingConfig.exitBranches) {
              for (const exitBranch of matchingConfig.exitBranches) {
                const match = available.find(b =>
                  b.title.toLowerCase().includes(exitBranch.toLowerCase())
                );
                if (match) {
                  branchToClick = match;
                  logger.info(`Using exit branch to escape: "${match.title}"`);
                  break;
                }
              }
            }
          }
        }

        // Free action cycle detection
        if (!matchingConfig && branchToClick?.isFreeAction) {
          logger.warn('Only free actions available with no matching config — waiting for action points...');
          await waitForActions(minActionsToResume);
          continue;
        }

        // Simple mode abort — configured branch not found
        if (!branchToClick) {
          const isSimpleMode = storyletConfigs.some(s =>
            s.branch && currentStorylet?.title.toLowerCase().includes(s.target?.toLowerCase())
          );
          if (isSimpleMode) {
            logger.warn(`Simple mode: configured branch not found — exiting storylet`);
            const exitBtn = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
            if (exitBtn) {
              await page.click('div.buttons--storylet-exit-options button:not([disabled])');
              await randomDelay(400, 800);
            }
            continue;
          }
        }

        // No matching config — check if this is an autofire storylet
        if (!branchToClick) {
          logger.warn(`No matching config for storylet: "${currentStorylet?.title}" — checking for autofire...`);

          // If no "Perhaps not" exit button exists, this is likely an autofire storylet
          const hasExit = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
          if (!hasExit) {
            logger.warn('No exit button found — autofire storylet detected — playing first available branch...');
            branchToClick = available[0];
          } else {
            // Has exit button — safe to exit
            logger.warn('Unknown storylet with exit button — exiting...');
            await page.click('div.buttons--storylet-exit-options button:not([disabled])');
            await randomDelay(400, 800);
            continue;
          }
        }

        if (branchToClick) {
          const branchEls = await page.$$('div.media.branch');
          const branchEl  = branchEls[branchToClick.index];
          const button    = await branchEl?.$('button.button--go');

          if (button) {
            logger.action(`Playing through: "${branchToClick.title}"`);
            await randomDelay(600, 1200);
            await button.click();
            await randomDelay(500, 1000);
            continue;
          }
        }
      }

      // All branches locked — wait for action point
      logger.warn('All branches locked — waiting for action point...');
      await waitForActions(minActionsToResume);
      continue;
    }

    
    if (['narrative', 'success', 'failure', 'sequence'].includes(state)) {
      const hasExitBtnNarr = await page.$('div.buttons--storylet-exit-options button');
      if (hasExitBtnNarr) {
        await page.waitForSelector(
          'div.buttons--storylet-exit-options button:not([disabled])',
          { timeout: 10000 }
        ).catch(() => null);

        const isDisabled = await page.$eval(
          'div.buttons--storylet-exit-options button',
          el => el.disabled
        ).catch(() => true);

        if (!isDisabled) {
          const text = await page.$eval(
            'div.buttons--storylet-exit-options button',
            el => el.textContent.trim()
          );
          logger.action(`Clicking: "${text}"`);
          await page.click('div.buttons--storylet-exit-options button:not([disabled])');
          await randomDelay(400, 800);
          continue;
        }

        await page.waitForTimeout(500);
        continue;
      }

      const hasPrimaryBtn = await page.$('button.button--primary:not([disabled])');
      if (hasPrimaryBtn) {
        const text = await page.$eval(
          'button.button--primary:not([disabled])',
          el => el.textContent.trim()
        );
        logger.action(`Clicking primary: "${text}"`);
        await page.click('button.button--primary:not([disabled])');
        await randomDelay(400, 800);
        continue;
      }
    }

    await page.waitForTimeout(500);
  }
}


async function findOnFeed(target) {
  const cards = await getFeedStorylets();
  return cards.find(c =>
    c.title.toLowerCase().includes(target.toLowerCase())
  );
}


async function clickBranchByTitle(branchTitle) {
  const page     = getPage();
  const branches = await getBranches();

  const target = branches.find(b =>
    b.title.toLowerCase().includes(branchTitle.toLowerCase()) && !b.isLocked
  );

  if (!target) return false;

  logger.action(`Clicking branch: "${target.title}"${target.isFreeAction ? ' (free action)' : ''}`);

  const branchEls = await page.$$('div.media.branch');
  const branchEl  = branchEls[target.index];
  const button    = await branchEl?.$('button.button--go');

  if (!button) return false;

  await randomDelay(600, 1200);
  await button.click();
  logger.success(`Branch clicked: "${target.title}"`);
  return { clicked: true, isFreeAction: target.isFreeAction };
}


async function handleNestedStorylet(nestedConfig) {
  const page = getPage();

  logger.info('Handling nested storylet...');
  await waitForPageSettle();

  const state = await getScreenState();

  if (state !== 'branch') {
    logger.warn(`Expected branch screen in nested storylet, got: ${state}`);
    return;
  }

  const currentStorylet = await getStorylet();
  logger.info(`Nested branch screen: "${currentStorylet?.title}"`);

  
  if (nestedConfig?.branch) {
    logger.info(`Nested config branch: "${nestedConfig.branch}"`);
    const result = await clickBranchByTitle(nestedConfig.branch);
    if (!result) {
      logger.warn(`Nested branch not available: "${nestedConfig.branch}" — clicking first available non-free branch`);
      const branches  = await getBranches();
      const available = branches.filter(b => !b.isLocked && !b.isFreeAction);
      if (available.length > 0) {
        const target    = available[0];
        const branchEls = await page.$$('div.media.branch');
        const branchEl  = branchEls[target.index];
        const button    = await branchEl?.$('button.button--go');
        if (button) {
          logger.action(`Nested fallback: "${target.title}"`);
          await randomDelay(600, 1200);
          await button.click();
        }
      }
    }
  }

  await randomDelay(500, 1000);
  await waitForPageSettle();

 
  const outcomeState = await getScreenState();
  if (['narrative', 'success', 'failure'].includes(outcomeState)) {
    const hasExitBtn = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
    if (hasExitBtn) {
      const text = await page.$eval(
        'div.buttons--storylet-exit-options button',
        el => el.textContent.trim()
      );
      logger.action(`Nested outcome: clicking "${text}"`);
      await page.click('div.buttons--storylet-exit-options button:not([disabled])');
      await randomDelay(400, 800);
      await waitForPageSettle();
    }
  }

  
  const returnClicked = await clickBranchByTitle('Return to the main');
  if (returnClicked) {
    logger.success('Returned to parent storylet');
    await randomDelay(400, 800);
    await waitForPageSettle();
  }

  
  const hasParentExit = await page.$('div.buttons--storylet-exit-options button:not([disabled])');
  if (hasParentExit) {
    const text = await page.$eval(
      'div.buttons--storylet-exit-options button',
      el => el.textContent.trim()
    );
    logger.action(`Exiting parent storylet: "${text}"`);
    await page.click('div.buttons--storylet-exit-options button:not([disabled])');
    await randomDelay(400, 800);
  }

  logger.success('Nested storylet complete — returned to feed');
}


async function checkCondition(condition) {
  if (!condition) return true;

  const value = await getQualityValue(condition.quality);

  if (value === null) {
    logger.warn(`Condition quality not found: "${condition.quality}" — skipping branch`);
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

  logger.info(`Condition: "${condition.quality}" ${operator} ${threshold} — current: ${value} — ${result ? 'PASS' : 'FAIL'}`);
  return result;
}


async function resolveBranch(storyletConfig) {
  
  if (storyletConfig.branch) {
    if (storyletConfig.condition) {
      const conditionMet = await checkCondition(storyletConfig.condition);
      if (!conditionMet) {
        logger.info(`Condition not met for: "${storyletConfig.branch}" — skipping`);
        return 'skipped';
      }
    }
    const result = await clickBranchByTitle(storyletConfig.branch);
    
    if (!result) {
      logger.warn(`Branch not available: "${storyletConfig.branch}"`);
      return 'skipped';
    }
    if (result.isFreeAction) {
      return { type: 'played_free', nestedStorylet: storyletConfig.nestedStorylet ?? null };
    }
    return 'played';
  }

  
  if (storyletConfig.branches && storyletConfig.branches.length > 0) {
    const sorted = [...storyletConfig.branches].sort((a, b) => a.priority - b.priority);

    for (const entry of sorted) {
      
      if (entry.condition) {
        const conditionMet = await checkCondition(entry.condition);
        if (!conditionMet) {
          logger.info(`Condition not met for: "${entry.branch}" — skipping`);
          continue;
        }
      }
      const result = await clickBranchByTitle(entry.branch);
      if (result) {
        if (result.isFreeAction) {
          return { type: 'played_free', nestedStorylet: entry.nestedStorylet ?? null };
        }
        return 'played';
      }
      logger.info(`Priority branch locked: "${entry.branch}" — trying next...`);
    }

    
    if (storyletConfig.exitBranches && storyletConfig.exitBranches.length > 0) {
      logger.info('All priority branches locked — checking exit branches...');

      for (const exitBranch of storyletConfig.exitBranches) {
        const result = await clickBranchByTitle(exitBranch);
        if (result) {
          logger.success(`Exit branch clicked: "${exitBranch}"`);
          return 'exited';
        }
      }
    }

    logger.warn('All priority and exit branches locked — waiting for refill');
    return 'skipped';
  }

  return 'skipped';
}


async function playStorylet(storyletConfig, minActionsToResume = 1) {
  const { target } = storyletConfig;

  logger.info(`Looking for storylet: "${target}"`);

  const card = await findOnFeed(target);
  if (!card) {
    logger.warn(`Storylet not on feed: "${target}" — skipping`);
    return { result: 'not_found' };
  }

  if (card.isLocked) {
    logger.warn(`Storylet locked: "${target}" — skipping`);
    return { result: 'locked' };
  }

  
  await enterStorylet(card.index);
  await randomDelay(500, 1000);
  await waitForPageSettle();

  
  let state = await getScreenState();
  while (state === 'narrative') {
    logger.info('Narrative intro — following through...');
    const outcome = await resolveOutcome();
    if (outcome.type === 'feed') {
      return { result: 'played', outcome };
    }
    state = await getScreenState();
  }

  if (state !== 'branch') {
    logger.warn(`Unexpected state after entering: ${state}`);
    await returnToFeed([storyletConfig], minActionsToResume);
    return { result: 'skipped' };
  }

  if (storyletConfig.equipment) {
    await handleEquipment(storyletConfig.equipment);
    await waitForPageSettle();
  }

  
  const branchResult = await resolveBranch(storyletConfig);

  if (branchResult === 'skipped') {
    await returnToFeed([storyletConfig], minActionsToResume);
    return { result: 'skipped' };
  }

  await randomDelay(500, 1000);

  
  
  if (branchResult?.type === 'played_free') {
    logger.info('Free action clicked — entering nested storylet...');
    const nestedConfig = branchResult.nestedStorylet ?? storyletConfig.nestedStorylet ?? null;
    await handleNestedStorylet(nestedConfig);
    return { result: 'played', outcome: { type: 'nested' } };
  }


  const outcome = await resolveOutcome();

  logger.success(`Storylet complete: "${target}" — outcome: ${outcome.type}`);
  return { result: branchResult, outcome };
}


async function runLoop(task) {
  const {
    name,
    location,
    repeatUntilOutOfActions,
    maxIterations,
    retryDelaySeconds,
    storylets,
  } = task;

  logger.info(`Starting task: "${name}"`);
  logger.info(`Location: "${location}"`);
  logger.info(`Mode: ${repeatUntilOutOfActions ? 'run until out of actions' : `max ${maxIterations} iterations`}`);
  logger.info('Configured storylets:');
  storylets.forEach((s, i) => {
    if (s.type === 'draw_cards') {
      logger.info(`  [${i + 1}] Draw Cards — mode: ${s.mode}${s.mode === 'finite' ? `, count: ${s.count}` : ''}`);
    } else if (s.type === 'use_item') {
      logger.info(`  [${i + 1}] Use Item: "${s.item}" → "${s.branch}"`);
    } else if (s.branch) {
      logger.info(`  [${i + 1}] "${s.target}" → "${s.branch}"`);
    } else if (s.branches) {
      const branchList = s.branches.map(b => `P${b.priority}:"${b.branch}"`).join(', ');
      const exitList   = s.exitBranches ? s.exitBranches.join(', ') : 'none';
      logger.info(`  [${i + 1}] "${s.target}"`);
      logger.info(`       Branches: ${branchList}`);
      logger.info(`       Exit when locked: ${exitList}`);
    }
  });

 
  const currentLocation = await getCurrentLocation();
  if (!currentLocation) {
    throw new Error('Could not detect current location — make sure the game is fully loaded');
  }

  if (!currentLocation.toLowerCase().includes(location.toLowerCase())) {
    throw new Error(
      `Wrong location!\n` +
      `  Expected: "${location}"\n` +
      `  Current:  "${currentLocation}"\n` +
      `  Please travel to the correct location and run the bot again.`
    );
  }

  logger.success(`Location verified: "${currentLocation}"`);

  let iteration         = 0;
  let consecutiveMisses = 0;
  const maxMisses       = 3;

  while (true) {
    iteration++;

    if (maxIterations && iteration > maxIterations) {
      logger.info(`Reached max iterations (${maxIterations}) — stopping`);
      break;
    }

    logger.info(`\n========== Iteration ${iteration} ==========`);

    
    const actions = await getActionCount();
    logger.info(`Action points: ${actions}`);

    if (actions < task.minActionsToResume) {
      logger.warn(`Actions (${actions}) below minimum (${task.minActionsToResume}) — waiting...`);
      await waitForActions(task.minActionsToResume);
    }

    
    await returnToFeed(storylets, task.minActionsToResume);

    
    let anyPlayed = false;

    for (const step of storylets) {


      if (step.type === 'use_item') {
        try {
          logger.info(`Use item step: "${step.item}" → "${step.branch}"`);
          await returnToFeed(storylets, task.minActionsToResume);
          if (step.equipment) {
            await handleEquipment(step.equipment);
            await waitForPageSettle();
          }
          const ok = await useInventoryItem(step.item, step.branch);
          if (ok) anyPlayed = true;
          await returnToFeed(storylets, task.minActionsToResume);
        } catch (err) {
          logger.error('Use item step failed', { error: err.message });
          await waitForPageSettle(5000);
          await returnToFeed(storylets, task.minActionsToResume);
        }
        continue;
      }

      // Card draw step
      if (step.type === 'draw_cards') {
        try {
          logger.info(`Card draw step — mode: ${step.mode}${step.mode === 'finite' ? `, count: ${step.count}` : ''}`);
          await returnToFeed(storylets, task.minActionsToResume);
          await runCardDraw(step);
          anyPlayed = true;
        } catch (err) {
          logger.error('Card draw step failed', { error: err.message });
          await waitForPageSettle(5000);
          await returnToFeed(storylets, task.minActionsToResume);
        }
        continue;
      }

      // Standard storylet step
      const storyletConfig = step;
      const currentActions = await getActionCount();
      if (currentActions === 0) {
        logger.warn('Out of actions — waiting for refill...');
        await waitForActions(task.minActionsToResume);
      }

      try {
        const result = await playStorylet(storyletConfig, task.minActionsToResume);

        if (result.result === 'played' || result.result === 'exited') {
          anyPlayed = true;

          if (result.result === 'exited') {
            logger.info(`Re-entering "${storyletConfig.target}" after exit...`);
            await returnToFeed(storylets, task.minActionsToResume);
          }

        } else {
          logger.warn(`Skipped: "${storyletConfig.target}" — ${result.result}`);
        }

        await returnToFeed(storylets, task.minActionsToResume);
        await randomDelay(800, 1500);

      } catch (err) {
        logger.error(`Failed: "${storyletConfig.target}"`, { error: err.message });
        logger.warn('Recovering...');
        await waitForPageSettle(10000);
        await returnToFeed(storylets, task.minActionsToResume);
      }
    }

    if (!anyPlayed) {
      consecutiveMisses++;
      logger.warn(`Nothing played this iteration (miss ${consecutiveMisses}/${maxMisses})`);

      if (consecutiveMisses >= maxMisses) {
        logger.error('No configured storylets available after multiple attempts — stopping');
        break;
      }

      logger.info(`Waiting ${retryDelaySeconds}s before retrying...`);
      await new Promise(r => setTimeout(r, retryDelaySeconds * 1000));
    } else {
      consecutiveMisses = 0;
    }

    logger.success(`Iteration ${iteration} complete`);
    await randomDelay(800, 1500);
  }

  logger.success(`Task "${name}" finished after ${iteration} iterations`);
}


export async function runTask(rawConfig) {
  const task = validateTask(rawConfig);
  await runLoop(task);
}