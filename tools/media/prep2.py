# The wind chime, by its shape: strings, ring, three tubes and the sail below. The sky behind it is rebuilt from the
# sky just left of it, and the chime itself becomes a sprite that can swing.
import sys, json, numpy as np, cv2
src, out = sys.argv[1], sys.argv[2]
orig = cv2.imread(src); plate = cv2.imread(out + '/hut-night.jpg')   # flame already painted out
H, W = orig.shape[:2]
m = np.zeros((H, W), np.uint8)
hook = (1257, 73)
for x in (1243, 1257, 1272): cv2.line(m, hook, (x, 124), 255, 3)        # cords to the ring
cv2.rectangle(m, (1238, 118), (1276, 131), 255, -1)                     # the ring
for x in (1243, 1257, 1271): cv2.line(m, (x, 128), (x, 165), 255, 3)    # cords to the tubes
for x0, x1 in ((1237, 1252), (1250, 1265), (1264, 1279)): cv2.rectangle(m, (x0, 160), (x1, 241), 255, -1)
cv2.line(m, (1257, 236), (1257, 268), 255, 3)                           # the cord to the sail
cv2.rectangle(m, (1248, 262), (1268, 322), 255, -1)                     # the sail
m = cv2.dilate(m, np.ones((3, 3), np.uint8))
# the sky behind: the same rows, 52 px to the left, blended in softly
fill = np.roll(orig, 52, axis=1)
soft = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 1.6)[..., None]
plate = (plate * (1 - soft) + fill * soft).astype(np.uint8)
# the sprite: how far each pixel stands from the sky behind it
y0, y1, x0, x1 = 66, 326, 1232, 1284
o = orig[y0:y1, x0:x1].astype(np.float32); bg = fill[y0:y1, x0:x1].astype(np.float32)
diff = np.abs(o - bg).max(axis=2)
a = np.clip((diff - 10) / 34, 0, 1) * (m[y0:y1, x0:x1] / 255)
a = cv2.GaussianBlur(a, (3, 3), 0)
cv2.imwrite(out + '/chime.png', np.dstack([orig[y0:y1, x0:x1], (a * 255).astype(np.uint8)]))
cv2.imwrite(out + '/hut-night.jpg', plate, [cv2.IMWRITE_JPEG_QUALITY, 86, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
meta = json.load(open(out + '/meta.json'))
meta['chime'] = {'x': x0 / W, 'y': y0 / H, 'w': (x1 - x0) / W, 'h': (y1 - y0) / H, 'pivot': [hook[0] / W, hook[1] / H]}
json.dump(meta, open(out + '/meta.json', 'w'), indent=1)
print(meta['chime'])
