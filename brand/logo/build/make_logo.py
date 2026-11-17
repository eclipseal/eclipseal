"""Builds the Eclipseal logo files from the Higgsfield outputs (Ideogram Vector wordmark + measured GPT Image mark)."""
import re, sys, json, math

src, root = sys.argv[1], sys.argv[2]
INK, BONE, EMBER, EMBER_DEEP = "#0A0A0B", "#E8E4DA", "#D9732F", "#B85A22"

# Wordmark: letters (bone paths) + counters of P and A (dark paths inside letters) as evenodd holes.
s = open(src).read()
paths = re.findall(r'<path fill="([^"]+)" d="([^"]+)"/>', s)
def coords(d):
    v = [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]
    return v[0::2], v[1::2]
keep = []
for fill, d in paths:
    xs, ys = coords(d)
    if max(xs) - min(xs) > 2000:  # background rectangle
        continue
    keep.append(d)
allx = [x for d in keep for x in coords(d)[0]]
ally = [y for d in keep for y in coords(d)[1]]
ox, oy = math.floor(min(allx)), math.floor(min(ally))
W, H = math.ceil(max(allx)) - ox, math.ceil(max(ally)) - oy

def shift(d):
    out, toks = [], re.findall(r'[A-Za-z]|-?\d+\.?\d*', d)
    nums = []
    def flush():
        for i in range(0, len(nums), 2):
            out.append(f"{nums[i] - ox:.1f} {nums[i + 1] - oy:.1f}")
        nums.clear()
    for t in toks:
        if t.isalpha():
            flush(); out.append(t)
        else:
            nums.append(float(t))
    flush()
    return " ".join(out).replace(".0 ", " ").replace(".0Z", "Z")
WM = " ".join(shift(d) for d in keep)
WM = re.sub(r"\.0(?=[ A-Za-z]|$)", "", WM)

# Mark geometry measured from the Higgsfield GPT Image mark (viewBox 64): outer, inner (moon) and the ember dot.
O = (32, 32, 28)
I = (28.09, 27.76, 21.87)
DOT_DISPLAY = (14.99, 9.95, 1.32)
ang = math.atan2(DOT_DISPLAY[1] - 32, DOT_DISPLAY[0] - 32)
DOT_UI = (round(32 + 27 * math.cos(ang), 2), round(32 + 27 * math.sin(ang), 2), 3.1)

def circle_d(cx, cy, r):
    return f"M{cx - r:g} {cy:g}A{r:g} {r:g} 0 1 0 {cx + r:g} {cy:g}A{r:g} {r:g} 0 1 0 {cx - r:g} {cy:g}Z"
CRESCENT = circle_d(*O) + circle_d(*I)

def mark_svg(dot, crescent_fill, dot_fill, bg=None):
    rect = f'<rect width="64" height="64" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{rect}'
            f'<path fill="{crescent_fill}" fill-rule="evenodd" d="{CRESCENT}"/>'
            f'<circle cx="{dot[0]:g}" cy="{dot[1]:g}" r="{dot[2]:g}" fill="{dot_fill}"/></svg>\n')

def wordmark_svg(fill):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
            f'<path fill="{fill}" fill-rule="evenodd" d="{WM}"/></svg>\n')

def lockup_svg(bg, fg, dot_fill):
    cap = H                       # wordmark cap height in wordmark units
    k = cap * 1.45 / 56           # outer circle diameter = 1.45x cap height
    box = 64 * k
    gap = cap * 0.5
    pad = cap * 0.9
    lw = box + gap + W
    vw, vh = lw + pad * 2, box + pad * 2
    wy = pad + (box - cap) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:.0f} {vh:.0f}">'
            f'<rect width="{vw:.0f}" height="{vh:.0f}" fill="{bg}"/>'
            f'<g transform="translate({pad:.1f} {pad:.1f}) scale({k:.4f})">'
            f'<path fill="{fg}" fill-rule="evenodd" d="{CRESCENT}"/>'
            f'<circle cx="{DOT_DISPLAY[0]:g}" cy="{DOT_DISPLAY[1]:g}" r="{DOT_DISPLAY[2] * 1.4:.2f}" fill="{dot_fill}"/></g>'
            f'<path transform="translate({pad + box + gap:.1f} {wy:.1f})" fill="{fg}" fill-rule="evenodd" d="{WM}"/></svg>\n')

files = {
    "brand/logo/eclipseal-mark.svg": mark_svg(DOT_DISPLAY, BONE, EMBER),
    "brand/logo/eclipseal-mark-small.svg": mark_svg(DOT_UI, BONE, EMBER),
    "brand/logo/eclipseal-mark-light.svg": mark_svg(DOT_DISPLAY, INK, EMBER_DEEP),
    "brand/logo/eclipseal-wordmark.svg": wordmark_svg(BONE),
    "brand/logo/eclipseal-wordmark-ink.svg": wordmark_svg(INK),
    "brand/logo/eclipseal-lockup-dark.svg": lockup_svg(INK, BONE, EMBER),
    "brand/logo/eclipseal-lockup-light.svg": lockup_svg(BONE, INK, EMBER_DEEP),
    "apps/web/src/app/icon.svg": mark_svg(DOT_UI, BONE, EMBER, INK),
}
for rel, body in files.items():
    open(f"{root}/{rel}", "w").write(body)
    print("wrote", rel, len(body), "bytes")

ts = f'''// Generated from the Higgsfield logo outputs by brand/logo/build/make_logo.py. Do not edit by hand.
// Mark: GPT Image 2.5 concept, measured into exact circles (viewBox 64). Wordmark: Ideogram Vector SVG.

export const MARK_CRESCENT = "{CRESCENT}";
/** Ember dot at display size (posters, PFP) and enlarged for UI sizes where 1.3 units would vanish. */
export const MARK_DOT = {{ display: {{ cx: {DOT_DISPLAY[0]}, cy: {DOT_DISPLAY[1]}, r: {DOT_DISPLAY[2]} }}, ui: {{ cx: {DOT_UI[0]}, cy: {DOT_UI[1]}, r: {DOT_UI[2]} }} }} as const;

export const WORDMARK_VIEWBOX = "0 0 {W} {H}";
export const WORDMARK_PATH =
  "{WM}";
'''
open(f"{root}/apps/web/src/components/brand/logo-paths.ts", "w").write(ts)
print("wrote apps/web/src/components/brand/logo-paths.ts; wordmark", W, "x", H, "path chars", len(WM))

# Same geometry for the X kit renderer, so banners and posts always match brand/logo.
kit = {
    "crescent": CRESCENT,
    "dot": {"display": {"cx": DOT_DISPLAY[0], "cy": DOT_DISPLAY[1], "r": DOT_DISPLAY[2]},
            "ui": {"cx": DOT_UI[0], "cy": DOT_UI[1], "r": DOT_UI[2]}},
    "wordmarkViewBox": f"0 0 {W} {H}",
    "wordmarkPath": WM,
}
open(f"{root}/brand/render/logo-data.js", "w").write(
    "// Generated by brand/logo/build/make_logo.py. Do not edit by hand.\nwindow.ECLIPSEAL = " + json.dumps(kit) + ";\n")
print("wrote brand/render/logo-data.js")
