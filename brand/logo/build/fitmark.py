"""Measure the eclipse mark: outer circle, inner (moon) circle and ember dot, from a flat PNG."""
import math, subprocess, sys

src = sys.argv[1]
W = H = 2048
raw = subprocess.run(["magick", src, "-resize", f"{W}x{H}!", "-depth", "8", "rgb:-"], capture_output=True, check=True).stdout

def px(x, y):
    i = (y * W + x) * 3
    return raw[i], raw[i + 1], raw[i + 2]

def cls(r, g, b):
    if r > 170 and g > 160 and b > 145 and r - b < 60:
        return 1  # bone
    if r > 150 and 50 < g < 160 and b < 110 and r - b > 80:
        return 2  # ember
    return 0

grid = bytearray(W * H)
ex = ey = en = 0
minx, maxx, miny, maxy = W, 0, H, 0
for y in range(H):
    row = y * W
    for x in range(W):
        i = (row + x) * 3
        c = cls(raw[i], raw[i + 1], raw[i + 2])
        grid[row + x] = c
        if c == 2:
            ex += x; ey += y; en += 1
        elif c == 1:
            minx = min(minx, x); maxx = max(maxx, x); miny = min(miny, y); maxy = max(maxy, y)

def fit(points):
    # Kasa algebraic circle fit: x^2 + y^2 + D x + E y + F = 0
    sx = sy = sxx = syy = sxy = sz = szx = szy = 0.0
    n = len(points)
    for x, y in points:
        z = x * x + y * y
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; szx += z * x; szy += z * y
    A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]
    b = [-szx, -szy, -sz]
    # solve 3x3
    import copy
    M = [A[i] + [b[i]] for i in range(3)]
    for c in range(3):
        p = max(range(c, 3), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(3):
            if r != c:
                f = M[r][c] / M[c][c]
                for k in range(c, 4):
                    M[r][k] -= f * M[c][k]
    D, E, F = (M[i][3] / M[i][i] for i in range(3))
    cx, cy = -D / 2, -E / 2
    return cx, cy, math.sqrt(cx * cx + cy * cy - F)

dot = (ex / en, ey / en, math.sqrt(en / math.pi))
cx0, cy0 = (minx + maxx) / 2, (miny + maxy) / 2
R0 = ((maxx - minx) + (maxy - miny)) / 4

def ang_far(a):
    dot_ang = math.atan2(dot[1] - cy0, dot[0] - cx0)
    d = abs((a - dot_ang + math.pi) % (2 * math.pi) - math.pi)
    return d > math.radians(14)

outer = []
for k in range(720):
    a = k * math.pi / 360
    if not ang_far(a):
        continue
    last = None
    r = R0 * 0.5
    while r < R0 * 1.2:
        x, y = int(cx0 + r * math.cos(a)), int(cy0 + r * math.sin(a))
        if 0 <= x < W and 0 <= y < H and grid[y * W + x] == 1:
            last = (cx0 + r * math.cos(a), cy0 + r * math.sin(a))
        r += 0.5
    if last:
        outer.append(last)
ocx, ocy, oR = fit(outer)

# moon centre: centroid of dark pixels inside the outer circle
mx = my = mn = 0
for y in range(int(ocy - oR), int(ocy + oR)):
    for x in range(int(ocx - oR), int(ocx + oR)):
        if (x - ocx) ** 2 + (y - ocy) ** 2 < (oR - 4) ** 2 and grid[y * W + x] == 0:
            mx += x; my += y; mn += 1
icx0, icy0 = mx / mn, my / mn
inner = []
for k in range(720):
    a = k * math.pi / 360
    if not ang_far(a):
        continue
    r = 1.0
    while r < oR * 1.5:
        x, y = int(icx0 + r * math.cos(a)), int(icy0 + r * math.sin(a))
        if not (0 <= x < W and 0 <= y < H):
            break
        if grid[y * W + x] == 1:
            inner.append((icx0 + r * math.cos(a), icy0 + r * math.sin(a)))
            break
        r += 0.5
icx, icy, iR = fit(inner)

print(f"outer  cx={ocx:.2f} cy={ocy:.2f} r={oR:.2f}  ({len(outer)} pts)")
print(f"inner  cx={icx:.2f} cy={icy:.2f} r={iR:.2f}  ({len(inner)} pts)")
print(f"dot    cx={dot[0]:.2f} cy={dot[1]:.2f} r={dot[2]:.2f}  ({en} px)")
gap = oR - (math.hypot(icx - ocx, icy - ocy) + iR)
print(f"min ring width (tangency gap) = {gap:.2f}px; max ring width = {oR + math.hypot(icx-ocx, icy-ocy) - iR:.2f}px")
# normalised to a 64 viewBox with the outer circle centred at 32,32 and radius 28
s = 28 / oR
def n(x, y):
    return 32 + (x - ocx) * s, 32 + (y - ocy) * s
ix, iy = n(icx, icy); dx, dy = n(dot[0], dot[1])
print(f"NORM outer=(32,32,28) inner=({ix:.3f},{iy:.3f},{iR*s:.3f}) dot=({dx:.3f},{dy:.3f},{dot[2]*s:.3f})")
