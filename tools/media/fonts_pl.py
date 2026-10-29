"""The game's two faces with the Polish letters they lack, embedded in game.html.

Kaisei Decol (the text, an old Japanese print antiqua) and Yuji Syuku (the brush) carry ł and ó but not ą ć ę ń ś ź ż,
so a browser drew those few letters in another font. This takes the Latin part of each font from Google Fonts, builds the missing letters from
the font's own strokes (the acute from ´, the dot from the i, the ogonek from the cedilla turned round), renames the
result (SIL Open Font License, Version 1.1) and writes it into game.html between the FONTS-PL markers as data URIs.

    pip install fonttools brotli
    python3 tools/media/fonts_pl.py          # rewrites the block in game.html
"""
import base64, io, re, sys, urllib.parse, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.recordingPen import RecordingPen, DecomposingRecordingPen
from fontTools.pens.boundsPen import BoundsPen

HERE = Path(__file__).resolve().parent
GAME = HERE.parent.parent / 'game.html'
TEXT = (''.join(chr(c) for c in range(32, 127)) + ''.join(chr(c) for c in range(0xA0, 0x100))
        + 'ąćęłńśźżĄĆĘŁŃŚŹŻ‐‑‒–—‘’‚“”„•…‹›′″→←↑↓−×·')
FACES = [('Kaisei Decol', 400, 'Zen Hand'), ('Kaisei Decol', 700, 'Zen Hand'), ('Yuji Syuku', 400, 'Zen Brush')]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'


def fetch(family, weight):
    url = ('https://fonts.googleapis.com/css2?family=' + family.replace(' ', '+') + ':wght@' + str(weight)
           + '&text=' + urllib.parse.quote(TEXT))
    css = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})).read().decode()
    src = re.findall(r'url\(([^)]+)\)', css)[0]
    return TTFont(io.BytesIO(urllib.request.urlopen(src).read()))


def bounds(gs, name, matrix=None):
    bp = BoundsPen(gs)
    gs[name].draw(TransformPen(bp, matrix) if matrix else bp)
    return bp.bounds


def contours(gs, name):
    """Each contour of a glyph on its own, as recordings."""
    rec = RecordingPen(); gs[name].draw(rec)
    out, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ('closePath', 'endPath'): out.append(cur); cur = []
    return out


def play(ops, pen):
    for op, args in ops: getattr(pen, op)(*args)


def build(font, new_family, weight):
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); g = lambda ch: cmap[ord(ch)]
    glyf, hmtx = font['glyf'], font['hmtx']

    # the acute as the font places it over o and O
    acute = g('´'); ab = bounds(gs, acute)
    def accent_shift(base_acc, base):
        bb = bounds(gs, base_acc); ob = bounds(gs, base)
        return bb[3] - ab[3], ((ob[0] + ob[2]) / 2) - ((ab[0] + ab[2]) / 2)   # dy, and where the o's middle is
    dy_lo, _ = accent_shift(g('ó'), g('o')); dy_up, _ = accent_shift(g('Ó'), g('O'))
    # the dot: the i's top contour
    ic = contours(gs, g('i'))
    def cb(ops):
        bp = BoundsPen(gs); play(ops, bp); return bp.bounds
    dot = max(ic, key=lambda c: cb(c)[1]); db = cb(dot)
    # the ogonek: the cedilla turned round (its contours mirrored and reversed so they keep their winding)
    ced = g('¸'); cbb = bounds(gs, ced)

    def compose(base, add):
        rec = DecomposingRecordingPen(gs)        # outlines only: a glyph may not mix contours and components
        gs[base].draw(rec); add(rec)
        pen = TTGlyphPen(None); rec.replay(pen)
        return pen.glyph()

    def with_acute(base, upper):
        bb = bounds(gs, base); dy = dy_up if upper else dy_lo
        dx = (bb[0] + bb[2]) / 2 - (ab[0] + ab[2]) / 2 + (bb[2] - bb[0]) * 0.06    # a touch right, the Polish way
        return lambda pen: gs[acute].draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))

    def with_dot(base, upper):
        bb = bounds(gs, base); dy = dy_up - dy_lo if upper else 0
        ib = bounds(gs, g('i'))
        # the dot as high over the letter as the i's dot over the i's stem, raised for a capital like the acute
        dx = (bb[0] + bb[2]) / 2 - (db[0] + db[2]) / 2
        return lambda pen: play(dot, TransformPen(pen, (1, 0, 0, 1, dx, dy)))

    def with_ogonek(base, where):
        bb = bounds(gs, base); w = bb[2] - bb[0]
        x = bb[0] + w * where
        cw = cbb[2] - cbb[0]
        # mirrored about the cedilla's middle, its top just into the letter's foot, its left end under the letter
        m = (-1, 0, 0, 1, x + (cbb[0] + cbb[2]) / 2 + cw * 0.05, -cbb[3] * 0.15 + 4)
        return lambda pen: gs[ced].draw(TransformPen(ReverseContourPen(pen), m))

    made = {
        'ą': ('a', with_ogonek(g('a'), 0.86)), 'ę': ('e', with_ogonek(g('e'), 0.62)),
        'Ą': ('A', with_ogonek(g('A'), 0.9)), 'Ę': ('E', with_ogonek(g('E'), 0.78)),
        'ć': ('c', with_acute(g('c'), False)), 'ń': ('n', with_acute(g('n'), False)), 'ś': ('s', with_acute(g('s'), False)),
        'ź': ('z', with_acute(g('z'), False)), 'ż': ('z', with_dot(g('z'), False)),
        'Ć': ('C', with_acute(g('C'), True)), 'Ń': ('N', with_acute(g('N'), True)), 'Ś': ('S', with_acute(g('S'), True)),
        'Ź': ('Z', with_acute(g('Z'), True)), 'Ż': ('Z', with_dot(g('Z'), True)),
    }
    order = list(font.getGlyphOrder())
    for ch, (base, add) in made.items():
        if ord(ch) in cmap: continue
        name = 'uni%04X' % ord(ch)
        glyph = compose(g(base), add)
        glyph.recalcBounds(glyf)
        order.append(name); font.setGlyphOrder(order); glyf.glyphOrder = order
        glyf.glyphs[name] = glyph
        hmtx[name] = (hmtx[g(base)][0], glyph.xMin if hasattr(glyph, 'xMin') else 0)
        for t in font['cmap'].tables:
            if t.isUnicode(): t.cmap[ord(ch)] = name
    font['maxp'].numGlyphs = len(order)
    for tag in ('vhea', 'vmtx', 'VORG'):          # the vertical setting of a Japanese font: nothing here writes downward
        if tag in font: del font[tag]
    if 'post' in font and font['post'].formatType == 2.0: font['post'].formatType = 3.0   # glyph names are not needed

    # a renamed family, as the licence asks of a changed font
    style = {600: 'SemiBold', 700: 'Bold'}.get(weight, 'Regular')
    nm = font['name']
    old = nm.getDebugName(0) or ''
    for rec in list(nm.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17): nm.removeNames(nameID=rec.nameID)
    full = new_family + ('' if style == 'Regular' else ' ' + style)
    for nid, val in [(0, old + '. Polish letters added for Zen Grains, 2026.'), (1, new_family), (2, style),
                     (3, full + '; Zen Grains'), (4, full), (6, full.replace(' ', '') ),
                     (13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'),
                     (14, 'https://openfontlicense.org')]:
        nm.setName(val, nid, 3, 1, 0x409)
    font['OS/2'].usWeightClass = weight
    font.flavor = None
    ttf = io.BytesIO(); font.save(ttf); ttf.seek(0)          # as a plain font first, then packed again as woff2
    out = TTFont(ttf); out.flavor = 'woff2'
    buf = io.BytesIO(); out.save(buf)
    return buf.getvalue()


def main():
    rules = []
    for fam, w, new in FACES:
        data = build(fetch(fam, w), new, w)
        print(new, w, len(data), 'bytes', file=sys.stderr)
        rules.append("@font-face { font-family: '%s'; font-weight: %d; font-display: swap; src: url(data:font/woff2;base64,%s) format('woff2'); }"
                     % (new, w, base64.b64encode(data).decode()))
    block = ('<style id="fonts-pl">\n/* FONTS-PL BEGIN: Kaisei Decol and Yuji Syuku (SIL OFL 1.1) with the Polish letters they lack, made by\n'
             '   tools/media/fonts_pl.py; do not edit by hand */\n' + '\n'.join(rules) + '\n/* FONTS-PL END */\n</style>')
    src = GAME.read_text(encoding='utf-8')
    if '<style id="fonts-pl">' in src:
        src = re.sub(r'<style id="fonts-pl">.*?</style>', lambda m: block, src, flags=re.S)
    else:
        i = src.index('<style>')
        src = src[:i] + block + '\n' + src[i:]
    GAME.write_text(src, encoding='utf-8')


if __name__ == '__main__':
    main()
