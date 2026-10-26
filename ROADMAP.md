# Zen Grain — what is next

## Open
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
  - **The magic scroll (a board):** an unrolled scroll on wooden rollers, an ink landscape on it that glows faintly. Its own grain only works here: **moonseeds**, light and pale, that float, drifting slowly on their own and gliding far when pushed, so a gathered heap never stays put.
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
