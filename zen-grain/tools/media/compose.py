# Zen Grain: the painting, rearranged for a phone held upright.
# From the wide night painting: the window onto the board and the valley, with the candle moved beside the board, both
# voile curtains brought in to frame it, a log ceiling above for the title and the dark of the room below. The candle
# flame, the wind chime and the lantern come out as sprites so the page can move them.
import sys, json, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
O = cv2.imread(src).astype(np.float32)                 # BGR, 1536 x 1024
H, W = O.shape[:2]
lum = lambda a: 0.299 * a[..., 2] + 0.587 * a[..., 1] + 0.114 * a[..., 0]
def feather(m, r): return cv2.GaussianBlur(m.astype(np.float32), (0, 0), r) if r else m.astype(np.float32)
def over(dst, img, a, x, y):                           # paste img with alpha a (0..1) at x, y, clipped
    h, w = a.shape; X0, Y0 = max(0, x), max(0, y); X1, Y1 = min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if X1 <= X0 or Y1 <= Y0: return
    aa = a[Y0 - y:Y1 - y, X0 - x:X1 - x, None]
    dst[Y0:Y1, X0:X1] = dst[Y0:Y1, X0:X1] * (1 - aa) + img[Y0 - y:Y1 - y, X0 - x:X1 - x] * aa
meta = {}

# ---- 1. the flame comes out of the candle (it becomes a sprite)
P = O.copy()
x0, y0, x1, y1 = 264, 561, 320, 627
reg = lum(O[y0:y1, x0:x1]); fm = (reg > 175).astype(np.uint8) * 255
fm = cv2.dilate(fm, np.ones((5, 5), np.uint8)); mask = np.zeros((H, W), np.uint8); mask[y0:y1, x0:x1] = fm
P = cv2.inpaint(P.astype(np.uint8), mask, 6, cv2.INPAINT_TELEA).astype(np.float32)
fa = cv2.GaussianBlur(np.clip((reg - 120) / 110, 0, 1), (3, 3), 0) * (fm > 0)
cv2.imwrite(out + '/flame.png', np.dstack([O[y0:y1, x0:x1], fa * 255]).astype(np.uint8))
ys, xs = np.nonzero(fm); wick = (x0 + float(np.median(xs)), y0 + float(ys.max()))
flame_box = (x0, y0, x1 - x0, y1 - y0)

# ---- 2. the chime comes out of the sky (sprite); the sky behind is the sky just left of it
m = np.zeros((H, W), np.uint8); hook = (1257, 73)
for x in (1243, 1257, 1272): cv2.line(m, hook, (x, 124), 255, 3)
cv2.rectangle(m, (1238, 118), (1276, 131), 255, -1)
for x in (1243, 1257, 1271): cv2.line(m, (x, 128), (x, 165), 255, 3)
for a_, b_ in ((1237, 1252), (1250, 1265), (1264, 1279)): cv2.rectangle(m, (a_, 160), (b_, 241), 255, -1)
cv2.line(m, (1257, 236), (1257, 268), 255, 3); cv2.rectangle(m, (1248, 262), (1268, 322), 255, -1)
m = cv2.dilate(m, np.ones((3, 3), np.uint8))
fill = np.roll(O, 52, axis=1); soft = feather(m / 255, 1.6)[..., None]
P = P * (1 - soft) + fill * soft
cy0, cy1, cx0, cx1 = 66, 326, 1232, 1284
diff = np.abs(O[cy0:cy1, cx0:cx1] - fill[cy0:cy1, cx0:cx1]).max(axis=2)
ca = cv2.GaussianBlur(np.clip((diff - 10) / 34, 0, 1) * (m[cy0:cy1, cx0:cx1] / 255), (3, 3), 0)
cv2.imwrite(out + '/chime.png', np.dstack([O[cy0:cy1, cx0:cx1], ca * 255]).astype(np.uint8))
chime_pivot = (hook[0] - cx0, hook[1] - cy0)

# ---- 3. the lantern comes off the wall (sprite), by its shape
lm = np.zeros((H, W), np.uint8)
cv2.ellipse(lm, (240, 112), (22, 30), 0, 180, 360, 255, 3)            # the bail
cv2.line(lm, (218, 112), (222, 140), 255, 3); cv2.line(lm, (262, 112), (258, 140), 255, 3)
cv2.rectangle(lm, (236, 72), (245, 86), 255, -1)                       # the ring on top
cv2.fillPoly(lm, [np.array([(226, 113), (254, 113), (262, 136), (218, 136)])], 255)   # the cap
cv2.rectangle(lm, (208, 134), (276, 146), 255, -1)                     # the collar
cv2.ellipse(lm, (240, 178), (24, 36), 0, 0, 360, 255, -1)              # the glass
cv2.line(lm, (210, 140), (208, 226), 255, 7); cv2.line(lm, (272, 140), (276, 226), 255, 7)   # the side tubes
cv2.fillPoly(lm, [np.array([(214, 206), (268, 206), (282, 246), (276, 254), (206, 254), (200, 246)])], 255)  # the tank
# the glass is kept whole; elsewhere only the dark metal, so none of the wall comes with it
gl = np.zeros((H, W), np.float32); cv2.ellipse(gl, (240, 178), (23, 35), 0, 0, 360, 1, -1)
L_ = lum(O); warmwall = (O[..., 2] - O[..., 0]) / np.maximum(1, O[..., 2])
dk = np.clip((112 - L_) / 34, 0, 1) * np.clip((0.92 - warmwall) / 0.25 + (L_ < 60), 0, 1)
core = np.zeros((H, W), np.float32)                                    # the solid parts stay solid
cv2.fillPoly(core, [np.array([(229, 116), (251, 116), (258, 135), (222, 135)])], 1)
cv2.rectangle(core, (214, 137), (268, 144), 1, -1)
cv2.fillPoly(core, [np.array([(218, 212), (264, 212), (276, 244), (271, 250), (211, 250), (206, 244)])], 1)
la = feather(np.maximum(np.maximum(gl, core), (lm / 255) * dk), 0.7)
lx0, ly0, lx1, ly1 = 196, 68, 288, 258
cv2.imwrite(out + '/lantern.png', np.dstack([O[ly0:ly1, lx0:lx1], la[ly0:ly1, lx0:lx1] * 255]).astype(np.uint8))
lantern_ring = (240 - lx0, 72 - ly0)
lantern_glass = (240 - lx0, 180 - ly0)

# ---- 4. the frame: a window of the painting, room added above and below
X0, WF, T, B = 361, 645, 190, 76
HF = T + H + B
F = np.zeros((HF, WF, 3), np.float32)
F[T:T + H] = P[:, X0:X0 + WF]
# the ceiling: the roof log, again and again, into the dark
log = P[0:56, X0:X0 + WF]
for k in range(T):
    band = k // 56; r = k % 56; row = log[55 - r] if band % 2 == 0 else log[r]
    row = np.roll(row, 37 * band, axis=0)
    F[T - 1 - k] = row * (0.78 * np.exp(-k / 150.0)) * (0.88 if r < 3 else 1)
# the room below: the floor, mirrored, into the dark
for k in range(B):
    F[T + H + k] = P[H - 1 - k, X0:X0 + WF] * (0.85 * np.exp(-k / 45.0))

# ---- 5. the left voile, moved in to frame the left side
sx0, sx1, sy0, sy1 = 296, 404, 30, 560
cm = np.ones((sy1 - sy0, sx1 - sx0), np.float32)
cm[:, -14:] *= np.linspace(1, 0, 14)[None, :]
cm[-20:, :] *= np.linspace(1, 0, 20)[:, None]
over(F, P[sy0:sy1, sx0:sx1], cm, 0, T + sy0)
# ---- 6. the right voile, tied back, behind the tea
rx0, rx1, ry0, ry1 = 1322, 1450, 30, 636
cm = np.ones((ry1 - ry0, rx1 - rx0), np.float32)
cm[:, :16] *= np.linspace(0, 1, 16)[None, :]
cm[-22:, :] *= np.linspace(1, 0, 22)[:, None]
cm[540 - ry0:, 1398 - rx0:] = 0                                        # not the cushion on the bench behind
cm = feather(cm, 2)
rdx = WF - (rx1 - rx0)
over(F, P[ry0:ry1, rx0:rx1], cm, rdx, T + ry0)
# the tea goes back in front of it
mm = np.zeros((H, W), np.float32)
cv2.ellipse(mm, (908, 612), (44, 12), 0, 0, 360, 1, -1)
cv2.fillPoly(mm, [np.array([(864, 612), (952, 612), (944, 676), (932, 694), (884, 694), (872, 676)])], 1)
cv2.ellipse(mm, (958, 640), (22, 28), 0, -90, 90, 1, 8)
mm = feather(mm, 1.0)
over(F, P[580:705, 855:990], mm[580:705, 855:990], 855 - X0, T + 580)

# ---- 7. the candle, moved beside the board, a little nearer
kx0, ky0, kx1, ky1 = 218, 590, 366, 728
km = np.zeros((H, W), np.float32)
cv2.ellipse(km, (292, 692), (70, 30), 0, 0, 360, 1, -1)                # the dish
cv2.rectangle(km, (263, 630), (319, 692), 1, -1)                       # the candle
cv2.ellipse(km, (291, 630), (28, 8), 0, 0, 360, 1, -1)                 # its top
km = feather(km, 1.2)[ky0:ky1, kx0:kx1]
nx, ny = 6, 212                                                        # where its box lands in the frame
sh = np.zeros((ky1 - ky0, kx1 - kx0 + 40), np.float32)                 # its shadow on the table
cv2.ellipse(sh, (96, 110), (86, 24), 0, 0, 360, 1, -1); sh = feather(sh, 9) * 0.55
over(F, np.zeros((sh.shape[0], sh.shape[1], 3), np.float32), sh, nx, ny + ky0 + 6)
over(F, P[ky0:ky1, kx0:kx1], km, nx, ny + ky0)
candle_wick = (wick[0] - kx0 + nx, wick[1] + ny)
# ---- 8. a soft vignette ties the pieces together
yy, xx = np.mgrid[0:HF, 0:WF].astype(np.float32)
v = 1 - 0.28 * np.clip((np.abs(xx / WF - 0.5) * 2) ** 2.2, 0, 1) - 0.25 * np.clip(((yy / HF - 0.45) * 2.1) ** 4, 0, 1)
F *= v[..., None]
cv2.imwrite(out + '/zen-night.jpg', np.clip(F, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 86, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])

# ---- 9. where things are, as shares of the frame
fx = lambda x: round((x - X0) / WF, 4); fy = lambda y: round((y + T) / HF, 4)
def peaks(x0, y0, x1, y1, thr, n, sep):
    r = lum(P[y0:y1, x0:x1]); d = r - cv2.GaussianBlur(r, (0, 0), 6); pts = []
    while len(pts) < n:
        i = int(np.argmax(d)); yy_, xx_ = divmod(i, d.shape[1])
        if d[yy_, xx_] < thr: break
        pts.append([fx(x0 + xx_), fy(y0 + yy_)]); d[max(0, yy_ - sep):yy_ + sep, max(0, xx_ - sep):xx_ + sep] = -999
    return pts
meta = {
  'size': [WF, HF],
  'table': [fx(700), fy(772)], 'board': round(384 / WF, 4),
  'cup': [fx(908), fy(604)],
  'flame': {'wick': [round(candle_wick[0] / WF, 4), round(candle_wick[1] / HF, 4)],
            'w': round(flame_box[2] / WF, 4), 'h': round(flame_box[3] / HF, 4),
            'ax': round((wick[0] - flame_box[0]) / flame_box[2], 4), 'ay': round((wick[1] - flame_box[1]) / flame_box[3], 4)},
  'chime': {'w': round((cx1 - cx0) / WF, 4), 'h': round((cy1 - cy0) / HF, 4), 'pivot': [round(chime_pivot[0] / (cx1 - cx0), 4), round(chime_pivot[1] / (cy1 - cy0), 4)]},
  'lantern': {'w': round((lx1 - lx0) / WF, 4), 'h': round((ly1 - ly0) / HF, 4), 'ring': [round(lantern_ring[0] / (lx1 - lx0), 4), round(lantern_ring[1] / (ly1 - ly0), 4)],
              'glass': [round(lantern_glass[0] / (lx1 - lx0), 4), round(lantern_glass[1] / (ly1 - ly0), 4)]},
  'beam': fy(78),
  'stars': peaks(470, 80, 1000, 250, 40, 30, 7),
  'lights': peaks(820, 415, 1000, 486, 30, 18, 4),
}
json.dump(meta, open(out + '/meta.json', 'w'))
print(json.dumps({k: v for k, v in meta.items() if k not in ('stars', 'lights')}), len(meta['stars']), len(meta['lights']))
