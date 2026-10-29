"""The helpers' medallions: a picture of a medallion on black turned into a flat, round game piece.

The medallion is found on its black ground and cut out as a circle (a hair inside its outer edge, so no black
fringe is left). Then it is made to sit with the game's drawn things rather than look like a photograph: the fine
texture of the picture is smoothed away, the studio light is evened out (the game lays its own light and rim
over it), and the colour is lifted a little.
    python3 tools/media/medals.py SOURCE.png public/medal-cat-front.webp
"""
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32) / 255.0
lum = a.max(axis=2)
# the medallion: everything clearly brighter than the black ground; its box gives the centre and the radius
mask = lum > 0.16
ys, xs = np.nonzero(mask)
# ignore stray light at the edges of the frame: keep the central 96%
h, w = lum.shape
keep = (xs > w * 0.02) & (xs < w * 0.98) & (ys > h * 0.02) & (ys < h * 0.98)
xs, ys = xs[keep], ys[keep]
x0, x1, y0, y1 = np.percentile(xs, 0.2), np.percentile(xs, 99.8), np.percentile(ys, 0.2), np.percentile(ys, 99.8)
cx, cy, r = (x0 + x1) / 2, (y0 + y1) / 2, min(x1 - x0, y1 - y0) / 2 * 0.985
box = (round(cx - r), round(cy - r), round(cx + r), round(cy + r))
face = im.crop(box)
N = 1024
face = face.resize((N, N), Image.LANCZOS)
# smooth the picture's fine grain, keep its edges
face = face.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.SMOOTH_MORE)
# even out the studio light: divide by the broad light, half way
f = np.asarray(face).astype(np.float32) / 255.0
broad = np.asarray(face.filter(ImageFilter.GaussianBlur(N / 6))).astype(np.float32) / 255.0
bl = broad.mean(axis=2, keepdims=True)
f = np.clip(f * (1 + 0.5 * (bl.mean() / np.maximum(bl, 0.05) - 1)), 0, 1)
face = Image.fromarray((f * 255).astype(np.uint8))
face = ImageEnhance.Color(face).enhance(1.15)
face = ImageEnhance.Contrast(face).enhance(1.06)
# a round cut with a soft pixel of edge
yy, xx = np.mgrid[0:N, 0:N]
d = np.hypot(xx - (N - 1) / 2, yy - (N - 1) / 2)
alpha = np.clip((N / 2 - 1 - d) / 1.5, 0, 1)
rgba = np.dstack([np.asarray(face).astype(np.float32) / 255.0, alpha])
img = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').resize((512, 512), Image.LANCZOS)
img.save(out, 'WEBP', quality=88, method=6)
print(out, 'centre', round(cx), round(cy), 'radius', round(r))
