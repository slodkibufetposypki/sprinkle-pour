# Cut the moving parts out of the painting: the candle flame and the wind chime become sprites,
# the plate gets them painted out; stars and lake lights are located for the twinkle overlay.
import sys, json, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src)                       # BGR
H, W = im.shape[:2]
f = im.astype(np.float32)
lum = 0.299 * f[..., 2] + 0.587 * f[..., 1] + 0.114 * f[..., 0]
def box(x0, y0, x1, y1): return int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)

plate = im.copy()
meta = {}

# --- candle flame: bright pixels above the wick
x0, y0, x1, y1 = box(0.172, 0.548, 0.208, 0.6125)
reg = lum[y0:y1, x0:x1]
m = (reg > 175).astype(np.uint8) * 255
m = cv2.dilate(m, np.ones((5, 5), np.uint8))
mask = np.zeros((H, W), np.uint8); mask[y0:y1, x0:x1] = m
plate = cv2.inpaint(plate, mask, 6, cv2.INPAINT_TELEA)
a = np.clip((reg - 120) / 110, 0, 1)                 # soft alpha from brightness
a = cv2.GaussianBlur(a, (3, 3), 0) * (m > 0)
spr = np.dstack([im[y0:y1, x0:x1], (a * 255).astype(np.uint8)])
cv2.imwrite(out + '/flame.png', spr)
ys, xs = np.nonzero(m)
meta['flame'] = {'x': x0 / W, 'y': y0 / H, 'w': (x1 - x0) / W, 'h': (y1 - y0) / H,
                 'wick': [(x0 + np.median(xs)) / W, (y0 + ys.max()) / H]}

# --- stars and lake/village lights: local brightness peaks
def peaks(bx, thr, n, sep):
    x0, y0, x1, y1 = box(*bx)
    r = lum[y0:y1, x0:x1].copy()
    bg = cv2.GaussianBlur(r, (0, 0), 6)
    d = r - bg
    pts = []
    for _ in range(n * 6):
        i = np.argmax(d); yy, xx = divmod(i, d.shape[1])
        if d[yy, xx] < thr: break
        pts.append([round((x0 + xx) / W, 4), round((y0 + yy) / H, 4), round(float(d[yy, xx]), 1)])
        d[max(0, yy - sep):yy + sep, max(0, xx - sep):xx + sep] = -999
        if len(pts) >= n: break
    return pts
meta['stars'] = [p for p in peaks((0.27, 0.075, 0.79, 0.24), 40, 40, 7)]
meta['lights'] = [p for p in peaks((0.50, 0.405, 0.75, 0.475), 30, 36, 4)]
cv2.imwrite(out + '/hut-night.jpg', plate, [cv2.IMWRITE_JPEG_QUALITY, 86, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
json.dump(meta, open(out + '/meta.json', 'w'), indent=1)
print(meta['flame'], len(meta['stars']), len(meta['lights']))
