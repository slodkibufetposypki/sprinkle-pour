"""The porcelain board's gold seams, taken from the concept painting of the tray they were first seen on.

Inside the tray's rim, only the gold is kept: pixels of the seams' own hue and strength. The capybara and the
yuzu, which are warm too, are left out by where they sit in the painting, and the rim's rounded corners too.
Each pixel is unblended from the white glaze, so the seams keep their soft edges and their own shine.
    python3 tools/media/porcelain_gold.py CONCEPT.png public/zen-porcelain-gold.webp
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W0, H0 = im.size
inset = round(W0 * 0.045)                      # inside the rim and the tray's wall line
im = im.crop((inset, inset, W0 - inset, H0 - inset))
a = np.asarray(im).astype(np.float32) / 255.0
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(axis=2), a.min(axis=2)
sat = (mx - mn) / np.maximum(mx, 1e-4)
hue = np.zeros_like(mx)
d = np.maximum(mx - mn, 1e-4)
hr = ((g - b) / d) % 6; hg = (b - r) / d + 2; hb = (r - g) / d + 4
hue = np.where(mx == r, hr, np.where(mx == g, hg, hb)) * 60
h, w = mx.shape
# sure gold: the seams' own hue and strength; then grown along fainter gold-ish pixels, so a seam keeps going where
# it crosses the grey ink of the painting
strong = (sat > 0.3) & (hue > 30) & (hue < 50) & (mx > 0.4) & (1 - mn > 0.3)
weak = (sat > 0.1) & (hue > 18) & (hue < 60) & (1 - mn > 0.14)
# not the capybara and the yuzu on its head (where they sit in the concept painting, as shares of the whole picture
# before the rim was cut off), not the tray's inner wall along the top
out_ok = np.ones_like(strong)
cx0, cx1, cy0, cy1 = 0.6, 0.82, 0.66, 0.85
out_ok[max(0, round(cy0 * H0) - inset):round(cy1 * H0) - inset, max(0, round(cx0 * W0) - inset):round(cx1 * W0) - inset] = False
out_ok[:round(h * 0.06)] = False
strong &= out_ok; weak &= out_ok
gold = strong
for _ in range(30):
    grown = np.asarray(Image.fromarray((gold * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(3))) > 0
    gold = gold | (grown & weak)
# the tray's rounded corners, where the rim curves in
yy, xx = np.mgrid[0:h, 0:w]
R = w * 0.12
for cx, cy in [(0, 0), (w, 0), (0, h), (w, h)]:
    gold &= (xx - cx) ** 2 + (yy - cy) ** 2 > R * R
keep = np.asarray(Image.fromarray((gold * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255.0
# unblend from the white glaze: soft edges stay soft, the colour is the gold's own
alpha = np.clip((1.0 - mn - 0.04) / 0.96, 0, 1)
alpha = np.clip(alpha * 1.6, 0, 1)
safe = np.maximum(alpha, 1e-4)[..., None]
col = np.clip((a - (1 - safe)) / safe, 0, 1)
# one gold throughout: the painting's own light and shade on it, but its hue gold, not the glaze that showed through
lum = col[..., 0] * 0.299 + col[..., 1] * 0.587 + col[..., 2] * 0.114
l = np.clip(lum / 0.62, 0, 1.6)[..., None]
base = np.array([0.88, 0.69, 0.33], np.float32)
col = np.clip(base * (0.55 + 0.55 * l) + np.clip(l - 1.05, 0, 1) * 0.5, 0, 1)
img = Image.fromarray((np.dstack([col, alpha * keep]) * 255).astype(np.uint8), 'RGBA')
W = 900
img = img.resize((W, round(img.height * W / img.width)), Image.LANCZOS)
img.save(out, 'WEBP', quality=90, method=6)
print(out, img.size)
