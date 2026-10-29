# Zen Grains: instructions for every session

Read `STATUS.md` first (where the work stands, what waits on Sławek), then `ROADMAP.md` (the plan and every decision
with its date) and `STYLE.md` (how every picture must look). Company rules live in `slodkibufetposypki/sweetbuffet-os`
(`CLAUDE.md`, `PROTOCOL.md`); start a cloud session with that repo attached so its rules and skills come along.

## Every change

1. Edit `game.html` (never `dist/`).
2. `npm test`: all tests pass.
3. `node build.mjs --local`, serve `dist/` and run `node tools/checks/canvas-stack.cjs http://localhost:8767/`: no LEAK.
4. Look at the change in a screenshot or a recording from this build before reporting it.
5. Commit with the attribution lines, push to `main`, and rewrite `STATUS.md` in the same push.
6. Prove it live from the site (the `sw.js` version), not from the push: acceptance is not effect.

## Gates: stop and ask

- **Credits** (Higgsfield or any paid generation): say the cost first and wait for a yes.
- **Pictures:** show the still for approval before turning it into a video or putting it in the game.
- Anything needing Sławek's login: Cloudflare, the domain and Access are set up by the Master session.

## Settled (Sławek, 28–29 Oct)

- Two style registers (`STYLE.md`): characters, medallions, scenes and menus painted in gouache; what you play with on
  the board (grains, bowls, sticks, the Zen Cat's paw) in a few soft tones, with no outlines and no texture.
- The bowls are drawn in code; the painted jar and chopstick rest stay.
- Mode names: Podróż (Journey), Pełnia (Full Moon). The score uses the thin hand, like the rest of the board.
- The Zen Cat is cream-white with ginger calico patches; her paw waves no with the toe next to the thumb, three
  wags in all (two one way, one the other). Never the middle toe.
- The old page in `sprinkle-pour/docs/zen-grain/` stays until zengrains.com works.
