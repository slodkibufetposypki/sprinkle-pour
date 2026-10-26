# Zen Grain — what is next

## Open
- **Zen mode, the next pass** (from the analysis of endless games: Mini Metro, Tetris Effect, Dorfromantik, Fruit Ninja, Block Blast, Geometry Dash, Subway Surfers, Balatro, Peggle):
  - Pressure that never stops rising, slowly: the jar's gap halves about every four minutes, no floor, so every run ends; skill pushes the end back (a life back for every few full bowls, at most three; the Zen Zone) but never removes it. Aim: about 3–5 minutes for a new player, 10–15 for a good one, 25+ for a master, tuned from testers' recordings and the bot.
  - Stages as the hours of a night in the zen garden (dusk, night, deep night, moon, stars, the cosmos), each with its own light on the gravel, a banner and something new; points are multiplied by the stage, so surviving is worth more than farming early.
  - **The beans change as you go, and get grander** (the owner's idea): every stage brings new kinds and retires old ones (never more than three to sort at once; a kind leaving has its bowl packed, the new kind takes its corner), each worth more per grain: the everyday ones first, then chickpeas and sesame, then moonseeds and kidney beans, then glowing star beans and ember beans, then nebula beans that shift colour, then the absurd ones (neon, crystal, a tiny galaxy inside), worth up to ten times a lentil.
  - **The golden bean** (the owner's idea): now and then one drops in, hops about the board and after a few seconds leaps off it. It can always be gathered, whatever kind the sticks are after: it walks into the row with them, never breaks it, and bursts into gold for a large bonus (and charge for the Zen Zone). A chime when it lands, a sparkle trail, a ring showing how long it stays.
  - Progress you can see: a stack of packed bowls beside the board, grains sorted and time, a quiet line for your best and "New best!" mid-run, milestones at 500 / 1,000 / 2,500 grains.
  - Combo tiers: ×2 warm tips, ×3 sparks, ×5 the sticks burn gold and the score glows, ×7 the raked lines shine and the music adds a layer, ×10 "Zen state" (petals, a moment of slow motion, full sound). The multiplier slowly cools without full rows. Breaking a streak hisses and goes dark.
  - The Zen Zone: full rows fill a meter; set off, the jar stops for eight seconds, wrong grains freeze and every row counts full and quick, then a big tally.
  - Between runs: zen ranks by best score, a lifetime count of grains, daily goals, looks to unlock (rake patterns, garden stones), a jar of the week (one shared seed for everyone).
  - Continue for a life: the Zen Cat gives one more life at game over, costing 1, then 2, then 4 cats in the same run, at most three times; runs with a continue are marked on score boards. No countdown on the offer.
  - For streamers: a score readable from afar, a share card with the jar's code, a replay of the last 30 seconds.
- **The workshop (the owner's idea, for later):** at some point in the game a workshop opens, where for points you build a new pair of chopsticks by joining two pairs you already own. The new pair carries both bonuses (e.g. cherry and ebony: the flash when the kind changes and slower wrong grains), and has a look of its own made from the two. To decide when it is built: what the points are (spent from score, sorted grains, or a currency of its own), when the workshop opens, whether the two pairs used are kept, and whether a joined pair can be joined again.
- **Mini-games now and then, to break the routine** (the owner's sister): stacking stones into a cairn with real physics (shapes, friction, balance); a pull-the-pin puzzle (beans held behind latches, released in the right order into the right bowls); a matching puzzle; copying a bean pattern in the zen sand. One at a time, the cairn first.
- **The result layout:** a card at the top is the default; `?done=card` and `?done=sheet` show the other two. Pick one after playing.
- **Hard levels:** mark every fourth or fifth level "hard" (a tighter clock), tuned from real players' times rather than guessed.
- **The room and its upgrades:** restoring and decorating the hut with stars (asset production, later).
- **Room by time of day:** morning, day and evening versions of the room. Each needs a re-lit image and a video from Higgsfield; the room's loop is made with `tools/media/room_loop.py`.
- **Daily board:** waiting on a choice: a share button (score sent by message), or a shared score board (needs an online service).
- **Music:** waiting on the owner.
- **A rule of Paper's own** (optional), e.g. grains slowly sliding into the fold.
- **Original fantasy content** (in the spirit of Ghibli and Zelda, never their names, characters or designs):
  - **The magic scroll (a board):** an unrolled scroll on wooden rollers, an ink landscape on it that glows faintly. On the scroll every grain floats: they all drift slowly on their own and glide far when pushed, so a gathered heap never stays put.
  - **Moonseeds (a grain):** light and pale, they come in with the scroll and then appear on other boards too. Off the scroll only the moonseeds float; everything else lies still as usual.
  - **Ember beans:** they glow warm and cool down as the round goes on, and are worth more while warm. Now and then one bursts on its own: it glows brighter and trembles for a moment first (time to pick it up), then pops with sparks, scattering the grains around it, and lies there as a cooled, ordinary bean.
  - Also proposed: a rune stone board (glowing lines that carry grains along them), spirit moss (soft, grains hardly roll), night glass (slippery, pushed grains slide far), acorns (roll and spin when pushed).
  - Where they go: as boards after Paper and before the endless one. That moves the endless board's levels, which saves keep by number, so the save needs a mapping when they are added.
- **Carrying rows yourself, if testers find it tedious** (the owner's worry): keep it to the parchment board only; a larger drop area; a flick toward the pile instead of carrying it there; or two rows carried at once for a bonus.

## For the App Store launch
- **Model:** first three boards free; one purchase (about 14.99 PLN) opens the rest, every board added later, and "open this board now" for a stuck player. No ads; at most optional rewarded ones, never between levels.
- **No stars for sale:** boards open at 70% of the stars before them, and selling stars would read as raising the bar to sell the way over it; consumable currency sold to children is also what stores and consumer authorities watch most.
- **Chopsticks with abilities (in the game now, earned by playing):** cherry lacquer flashes the kind to gather for a moment when it changes, mother-of-pearl (120 stars) keeps it lit all the time, ebony slows wrong grains by 20%, jade reaches 10% further, steel keeps stones back, gold leaf eases the pace line. Later: bought as a shortcut, off on the daily board and wherever scores are compared.
- **Helpers (in the game now, earned by playing):** the Zen Cat turns the clock back once a round, and is the first offer when the time is up; the Zen Hamster carries the stones off once a round. Three cats to start, a cat for a level's first five stars, two cats and two hamsters when a board opens. Later: sold in small packs, never offered to a child without the parent check.
- **Gentle setting, free:** slower wrong grains, weaker stones, a softer clock, for children and anyone stuck; levels played with it are marked.
- **Also for sale:** material packs (looks only), a supporter pack / tip jar.
- **Children:** a parent check before any price, no countdowns or "only today".
- **What the launch needs:** an Apple developer account (and Google Play's), the game wrapped as a store app (it already installs and works offline), purchases through StoreKit / Play Billing (15% for small developers), privacy labels and an age rating. A wrapper that is only a website can be refused; offline play, purchases and haptics make it an app.
