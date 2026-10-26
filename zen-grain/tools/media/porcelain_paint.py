"""The porcelain board's painting: a scan-like illustration on white turned into a layer that lies under a dark glaze.

The white is taken out exactly (each pixel unblended from white, so soft washes keep their softness). The grey-green
ink turns pale, as slip painted on a dark glaze; warm colours (the capybara, the yuzu) keep their own colour.
    python3 zen-grain/tools/media/porcelain_paint.py SOURCE.png docs/zen-grain/zen-porcelain.webp
"""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32) / 255.0
# unblend from white: alpha is how far the darkest channel is from white; the colour is what, laid over white, gives the pixel
alpha = 1.0 - a.min(axis=2)
alpha = np.clip((alpha - 0.035) / 0.965, 0, 1)            # the paper's own faint grey goes
safe = np.maximum(alpha, 1e-4)[..., None]
col = np.clip((a - (1 - safe)) / safe, 0, 1)
mx, mn = col.max(axis=2), col.min(axis=2)
sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
r, g, b = col[..., 0], col[..., 1], col[..., 2]
warm = (sat > 0.28) & (r >= g) & (g >= b * 0.9) & (r - b > 0.12)   # orange, tan, yellow: the capybara and the yuzu
# the capybara as a whole: its warm pixels, closed over its dark lines (eyes, nose, outline) and softened at the edge
from PIL import ImageFilter
warm &= alpha > 0.15                                         # real paint, not a warm speck of the paper
m = (Image.fromarray((warm * 255).astype(np.uint8), 'L').filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))   # specks out
     .filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.MinFilter(15)).filter(ImageFilter.GaussianBlur(1)))
w = np.asarray(m).astype(np.float32) / 255.0
pale = np.array([0.88, 0.90, 0.85], np.float32)
ink_shade = (1 - np.clip(mn, 0, 1))[..., None]               # darker ink: a little more opaque, never darker in colour
inkcol = pale * (0.82 + 0.18 * (1 - ink_shade))
# inside the capybara the painting keeps its own colours and dark lines, opaque as paint; outside, pale ink
outc = a * w[..., None] + inkcol * (1 - w[..., None])
outa = w + alpha * 0.9 * (1 - w)          # paint is opaque: the glaze does not show through the capybara
rgba = np.dstack([outc, outa])
img = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA')
# crop to what is painted, keep the bottom-right anchor
bbox = img.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox()
img = img.crop(bbox)
W = 900
img = img.resize((W, round(img.height * W / img.width)), Image.LANCZOS)
img.save(out, 'WEBP', quality=88, method=6)
print(out, img.size, bbox)
