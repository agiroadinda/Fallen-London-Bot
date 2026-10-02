Fallen London Bot
Before You Start

You need to install Node.js on your computer — this is what runs the bot.

Go to https://nodejs.org
Download the LTS version (says "Recommended For Most Users")
Run the installer — click Next on everything
Restart your computer when done

That is the only thing you need to install.

Setting Up Your Login

Inside the bot folder, create a new file called exactly:

.env

Open it with Notepad and paste this, filling in your details:

FL_EMAIL=your@email.com
FL_PASSWORD=yourpassword
FL_BASE_URL=https://www.fallenlondon.com
FL_HEADLESS=false
FL_SLOW_MO=80
FL_TIMEOUT=30000

Replace your@email.com and yourpassword with your Fallen London login.

Important: Your account must use email and password login. If you log in with Google or Apple, go to your Fallen London account settings and add an email and password there first.

How to Run the Bot

Step 1 — Open Fallen London in your normal browser and travel to the location you want the bot to work in. The bot will not travel for you.

Step 2 — Double-click start-bot.bat in the bot folder.

The first time you run it, it sets itself up automatically — this takes a couple of minutes. After that, a control panel opens in your browser.

Using the Control Panel

The control panel has a sidebar on the left and a main area on the right.

Left Sidebar

Saved Tasks — shows all tasks you have created. Click any task name to select it. Each task has two buttons:

Load — loads the task back into the builder so you can change it
Delete — permanently removes the task

Bot Control — select a task from the dropdown, then use:

▶ Start — launches the bot with the selected task
■ Stop — stops the bot at any time

A status indicator shows whether the bot is running or stopped.

Main Area — Five Tabs

Task Builder — where you create and edit tasks.

Bot Logs — live view of everything the bot is doing while running. Each line is colour coded: green for success, red for errors, yellow for warnings, purple for actions, blue for state changes.

JSON Preview — shows the raw task file. You do not need to use this unless something is not working and you want to inspect the task.

Card Database — where you configure what the bot does with each opportunity card it draws.

Blacklist — where you add items you never want the bot to equip.

Creating a Task
Click the Task Builder tab
Fill in Task Name — call it anything
Fill in Location — the exact location name shown in the game (e.g. "Spite" or "Your Activities")
Choose whether to run until actions run out or set a maximum number of iterations
Set Retry Delay — seconds to wait if a storylet is not found
Set Minimum Actions to Resume — see below
Add steps — see the next sections
Click Save Task
Minimum Actions to Resume

This setting controls when the bot starts a new run after running out of action points.

Set to 1 (default) — the bot resumes as soon as one action point refills
Set to 10 — the bot waits until it has 10 action points before starting again
Set to 40 — the bot waits until fully refilled before starting (paid accounts)
Step Types

A task is made up of steps. Each step tells the bot to do one thing. There are three types of steps. Every step type supports equipment swapping — see the Equipment section below.

Standard Storylet

A storylet is one of the activities on your story feed. Fill in:

Storylet Title — partial match is fine, e.g. "Mrs Chapman" matches the full title
Branch Mode — Simple (one branch) or Priority (try A first, then B)

Simple mode — fill in the branch name to click.

Priority mode — add branches in order of preference. The bot always tries Priority 1 first. If Priority 1 is locked or its condition fails, it tries Priority 2, and so on. Add Exit Branches for when all priority branches are locked — these collect a reward and exit the storylet so the bot can re-enter.

Nested 0-cost actions — some storylets take you to another screen when you click a free action. In simple mode, tick "This storylet has a nested 0-cost action" and fill in the branch to click inside the redirect. In priority mode, each branch has its own nested branch option so different priority branches can lead to different redirect screens.

Draw Opportunity Cards

This step draws cards from your opportunity deck and processes them according to your Card Database settings.

Draw Mode:

Finite — draw a set number of cards then stop
Infinite — keep drawing until no more progress can be made. Use this in locations that say "No draw limit." on the deck

Auto-Play Priority Threshold (optional) — if set, the bot will only automatically play cards whose priority number is equal to or lower than this value. Cards with a higher priority number are held in hand until the hand is full, at which point the best available card is played as a fallback. Leave blank to play all configured play cards immediately.

The bot will never spend Fate to draw cards. If the deck is empty it stops safely.

Use Inventory Item

This step uses an item from your Possessions inventory. Fill in:

Item Name — the exact name as it appears in your inventory (e.g. "Foxfire Candle Stub")
Branch to Click — the action to take when the item is used
Equipment Swapping

Every step type supports optional equipment swapping. Before clicking a branch, the bot can automatically change your equipped items to optimise for a stat or switch to a saved outfit. There are three options:

Do Nothing

Keep your current equipment unchanged. This is the default.

Equip (Maximise Stat)

Before taking the action, the bot navigates to your Possessions equipment section and checks every item in every slot. For each slot it finds the item that gives the highest bonus to your chosen stat and equips it. Items on the blacklist are never equipped.

Fill in the Stats to Maximise field with the stat name exactly as it appears in the game — e.g. Watchful, Shadowy, Dangerous, Persuasive. To maximise two stats combined (e.g. for challenges that check both), enter them separated by a comma — e.g. Watchful, Shadowy.

Equip (Specific Outfit)

Before taking the action, the bot switches to one of your saved outfits. Fill in the Outfit Name exactly as it appears in the Wear dropdown in your Possessions tab — e.g. Morning, Evening, Incognito.

Equipment Blacklist

The Blacklist tab lets you add items you never want the bot to equip, even if they would maximise the target stat. This is useful for items with significant negative side effects on other stats, or items you want to keep available for manual use.

To add an item to the blacklist:

Click the Blacklist tab
Enter the item name — partial match is fine, e.g. "Mask" will blacklist any item with "Mask" in the name
Click Add to Blacklist

Items can be removed from the blacklist at any time by clicking the ✕ button next to them.

Adding Conditions to Branches

A condition tells the bot to only click a branch if a quality or item quantity meets a certain level.

When adding a branch, tick "Add condition" and fill in:

Quality Name — e.g. Wounds, Casing, Foxfire Candle Stub
Operator — above / below / at least / at most / equals
Value — the number to check against

Where the bot looks for qualities:

Sidebar qualities (Watchful, Shadowy, Dangerous, Persuasive, Wounds etc.) are checked instantly
Story progress and other qualities (Casing, Monster Nurturer, Contacts etc.) are found by checking your Myself tab automatically
Item quantities (Foxfire Candle Stub, Whispered Secrets etc.) are found by checking your Possessions tab automatically

You do not need to do anything — the bot searches all three places in order. Use the quality or item name exactly as it appears in the game, without the number.

If the condition is not met, the bot skips that branch and tries the next priority branch. If no conditions are met, the storylet is skipped.

Managing the Card Database

The Card Database tab lets you configure what the bot does with each opportunity card it draws.

Card Actions
Play — open the card and click a specific branch inside it
Discard — remove the card from your hand without playing it
Hold — leave the card in your hand to be played manually

Any card not in the database is held automatically.

Multiple Branches Per Card

When adding a play card, you can add multiple branches. The bot tries them in order — the first branch that is available and meets its condition will be played. This is useful when a card has one option you prefer but it is sometimes locked or conditional.

Card Priority

Each card can be assigned a priority number. Lower numbers are better — priority 1 is played before priority 2.

Priority is used together with the Auto-Play Priority Threshold setting on the Draw Cards step:

Cards at or below the threshold are played immediately when drawn
Cards above the threshold are held until the hand is full, then the best available card is played as a fallback
Card Conditions

Each branch on a card can have a condition attached. If the condition is not met, the bot tries the next branch. Conditions work the same way as branch conditions — choose a quality or item, an operator, and a value.

Card Equipment

Each card can have equipment swapping configured. Before playing the card, the bot will equip the specified items or outfit. This works the same way as equipment on storylet steps.

Adding a Card
Click the Card Database tab
Enter the card name exactly as it appears in the game
Choose the action (Play, Discard, or Hold)
If playing, add one or more branches to try in order
Optionally set a priority number
Optionally set equipment swapping
Click Save Card
Starting and Stopping the Bot
Save your task using the Task Builder
Select it from the dropdown in the left sidebar
Click ▶ Start
Switch to the Bot Logs tab to watch what it is doing
Click ■ Stop at any time to stop the bot

The bot stops automatically when action points run out and waits for them to refill before continuing.

What the Bot Will Not Do
It will not travel between locations — be in the right location before starting
It will not spend Fate or real money on anything
It will not touch storylets, items, or cards you have not configured
It will not make decisions outside of what you have set up
Troubleshooting

"Node.js is not installed" error
Install Node.js from https://nodejs.org (LTS version) and restart.

"The .env file is missing" error
Create the .env file as described in the Setup section above.

"Wrong location" error
Travel to the correct location in the game and run the bot again.

The bot finds the storylet but skips the branch
Either the branch name does not match what appears in the game, the branch is locked, or a condition is not being met. Check the Bot Logs tab for details.

The bot skips a branch saying "condition quality not found"
The quality or item name was not found in the sidebar, Myself tab, or Possessions. Check the spelling — use the name exactly as it appears in the game without the number.

Item not found in Possessions
Make sure the item name matches exactly. The bot searches the inventory section of Possessions, not the equipment section.

Cards are being held when they should be played or discarded
Check the Card Database tab — the card may not be listed, or the name may not match exactly. Check the Bot Logs tab to see what name the bot detected.

The bot says "No priority cards available for fallback — hand is stuck"
The hand is full of cards that have no priority number and branch configured. Add the cards currently in your hand to the Card Database with a priority number and branch so the bot can use them as a fallback.

Equipment is not being swapped
Make sure the stat name matches exactly as it appears in game — e.g. "Watchful" not "watchful". For outfit mode, the outfit name must match exactly as it appears in the Wear dropdown.

An item is being equipped that I don't want
Add it to the Blacklist tab. Partial name match is fine — "Mask" will block any item containing "Mask" in its name.

The control panel does not open
Make sure start-bot.bat is still running in the background.

The bot keeps waiting and not playing
Your action points may have run out. Check the Bot Logs tab — it shows the next refill time and waits automatically.