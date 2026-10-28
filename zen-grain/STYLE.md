# Zen Grains: style

The full guide from the design review (27 Oct) is on the page "Pracownia Zen Grains"
(https://claude.ai/artifact/Ru9WhKoWKU47USHNyKHhpc): a candlelit still life, painted objects on one table, information
in ink, only gold and flame glowing. Since 28 Oct (the owner) it has **two registers**. Check every new picture
against the register it belongs to before it goes into the game.

## 1. Painted: characters, medallions, scenes, menus

The capybara, the medallions, the hut, the menu objects (tags, plaque, lacquer), the gifts. Hand-painted gouache in
soft realism, as in the guide. Every prompt starts with:

> Hand-painted gouache illustration, painterly realism with soft visible brush texture, from a quiet Japanese mountain
> tea hut at blue hour, lit by one warm candle from the upper left (2700K) with a faint cool indigo fill from the upper
> right, warm brown shadows falling down and to the right, muted earthy palette of honey wood, stoneware, washi paper,
> sumi ink and worn gold leaf, wabi-sabi, handmade, calm. Subject:

and avoids: text, letters, photorealistic 3D render, CGI, plastic, chrome, glossy, neon, bloom, cel shading, black
outlines, flat vector, anime eyes, chibi, oversaturated, cold blue light, several light sources, extra limbs, deformed
paws, human hands, clothes on animals.

Characters are three-quarter from the front at their own eye level, the same scale in every pose, each pose made from
its reference sheet (the capybara from F01).

## 2. Board: what you play with

The grains, the bowls, the sticks and the Zen Cat's paw: everything that moves under your finger. The painted bowls
read as photographs next to the grains, so the board is simpler, "more like a game" (the owner, 28 Oct):

- simple rounded shapes, readable at 40–120 px on a phone;
- a few soft tones (light, middle, shade) and at most one small highlight;
- **no outlines**: every edge comes from the tones;
- no texture, no fur strands, no speckle, nothing photographic;
- matte, muted colours, like the grains;
- lit from the upper left; no shadow in the picture, the game draws it (down and to the right, warm dark brown);
- seen from above, except a piece that turns toward you (the paw waving no).

The painted jar and the chopstick rest stay as they are (the owner liked them, 28 Oct).

A generated board piece starts with:

> Simple game piece for a calm mobile puzzle game, in the same look as the reference grains: smooth rounded shapes
> built from three or four soft matte tones and one small soft highlight, no outlines at all, every edge made by the
> tones, no texture, lit from the upper left. Subject:

and avoids: outline, black outline, line art, ink lines, sticker, cel shading, comic, texture, fur strands, realistic,
photo, 3D render, glossy plastic, cast shadow.

## The Zen Cat

The medallion is gold relief, so it gives her shape only: a round lucky cat sitting upright, one front paw raised, a
red collar with a small gold bell, eyes closed in a smile. Her colours come from the paw (28 Oct): cream-white fur
with ginger calico patches (one on the forearm of the raised paw), pink nose, pink inner ears and pink beans. Her
paw on the board is in the board register; she herself, wherever she appears whole, is painted like the capybara,
from her own reference sheet.

## Making pictures move

A video model animates one picture, so the character stays the same in every frame: the picture on a flat key colour
that is nowhere on the subject (blue #2056EC for warm subjects), the same picture as the first and the last frame for
a loop, then frames cut from the video, the background keyed out frame by frame, all frames cropped to one shared box.
Moving a whole piece in, out or round is done in code.
