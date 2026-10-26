# Zen Grain: the table seen from above, for choosing a board, made from the painting's own table.
# The table is straightened out of the painting's perspective. Its planks are cut out one by one where the wood is
# clear (left and right of the board), their light evened out, and laid again plank after plank into a tall frame:
# each row built from lengths of real plank, butted end to end like the boards of a table. Then it is lit like the
# room: warm from the candle off to the left, the lantern further off, the edges falling into shadow.
import sys, numpy as np, cv2
src, room, out = sys.argv[1], sys.argv[2], sys.argv[3]
O = cv2.imread(src)
quad = np.float32([[553, 707], [839, 707], [888, 842], [509, 842]])               # the board in the painting
flat = np.float32([[509, 602], [888, 602], [888, 842], [509, 842]])               # and as seen from straight above
R = cv2.warpPerspective(O, cv2.getPerspectiveTransform(quad, flat), (1900, 900), flags=cv2.INTER_CUBIC).astype(np.float32)
bands = [(588, 636), (636, 702), (702, 771)]                                       # three planks, seam to seam
spans = [(252, 500), (906, 1262)]                                                  # where the wood is clear of things
# the colour the table has round the board in the room, so this one matches it
F = cv2.imread(room).astype(np.float32)
target = np.concatenate([F[860:1020, 20:140].reshape(-1, 3), F[860:1020, 540:640].reshape(-1, 3)]).mean(axis=0)
k = 2.0
pieces = {j: [] for j in range(len(bands))}
for j, (a, b) in enumerate(bands):
    for (x0, x1) in spans:
        p = R[a:b, x0:x1]
        p = np.clip(p / np.maximum(cv2.GaussianBlur(p, (0, 0), 24), 1) * target, 0, 255)   # its own light evened out
        pieces[j].append(cv2.resize(p, (int(p.shape[1] * k), int(p.shape[0] * k)), interpolation=cv2.INTER_CUBIC))
W, H = 780, 1688
T = np.zeros((H, W, 3), np.float32)
rng = np.random.default_rng(11)
y, order = 0, [0, 1, 2]
while y < H:
    j = order[int(rng.integers(0, 3))]
    h = pieces[j][0].shape[0]
    row = np.zeros((h, W + 400, 3), np.float32); x = -int(rng.integers(0, 200))
    while x < W:
        p = pieces[j][int(rng.integers(0, 2))]
        if rng.random() < 0.5: p = p[:, ::-1]
        if rng.random() < 0.5: p = p[::-1]
        L = p.shape[1]; s = int(rng.integers(0, max(1, L // 3))); seg = p[:, s:]
        X0 = max(0, x); seg = seg[:, X0 - x:]; n = min(seg.shape[1], row.shape[1] - X0)
        joint = x > 0 and rng.random() < 0.3
        if x > 0 and not joint:                                                      # most lengths run on into the next
            fade = min(60, n); a = np.linspace(0, 1, fade)[None, :, None]
            row[:, X0:X0 + fade] = row[:, X0:X0 + fade] * (1 - a) + seg[:, :fade] * a
            row[:, X0 + fade:X0 + n] = seg[:, fade:n]
        else:
            row[:, X0:X0 + n] = seg[:, :n]
        if joint: row[:, max(0, x - 2):x + 2] *= 0.5                                # now and then a butt joint
        x += seg.shape[1] - (1 if joint else 60)
    hh = min(h, H - y); T[y:y + hh] = row[:hh, :W]; y += hh
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def pool(cx, cy, r, a): return a * np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)))
mean = T.reshape(-1, 3).mean(axis=0); T = mean + (T - mean) * 1.3                    # the grain a little stronger
light = 0.5 + pool(-60, 520, 700, 0.88) + pool(390, 900, 650, 0.35) + pool(W + 60, 260, 420, 0.15)
vig = 1 - 0.6 * np.clip(((xx / W - 0.5) * 2) ** 2 * 0.55 + ((yy / H - 0.47) * 2) ** 2 * 0.5, 0, 1)
T = np.clip(T * (light * vig)[..., None], 0, 255)
cv2.imwrite(out, T.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 84, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
print(T.shape, 'target', target.round(1), 'mean', T.reshape(-1, 3).mean(axis=0).round(1))
