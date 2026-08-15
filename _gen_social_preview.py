#!/usr/bin/env python3
# 生成 GitHub Social Preview (1280x640): 神性视觉 / 星云·流场·星系 主题
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random

W, H = 1280, 640
OUT = "/Users/hefeiyu/WorkBuddy/2026-08-04-12-23-07/github-social-preview.png"

# ---- 字体 ----
FONT_HELV = "/System/Library/Fonts/Helvetica.ttc"
FONT_CJK = "/System/Library/Fonts/Hiragino Sans GB.ttc"
def font(path, size, idx=0):
    return ImageFont.truetype(path, size, index=idx)

# ---- 颜色 ----
INDIGO = (124, 140, 255)   # #7c8cff
TEAL   = (70, 214, 192)    # #46d6c0
WHITE  = (244, 246, 255)
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

img = Image.new("RGB", (W, H), (5, 6, 13))
draw = ImageDraw.Draw(img, "RGBA")

# ---- 背景：自上而下的深空渐变 ----
top = (14, 17, 33)
bot = (4, 5, 11)
for y in range(H):
    t = y / H
    draw.line([(0, y), (W, y)], fill=lerp(top, bot, t))

# ---- 星云辉光（右侧径向，多层椭圆叠加）----
def nebula(cx, cy, rx, ry, color, layers=70, maxa=70):
    for i in range(layers):
        t = i / layers
        a = int(maxa * (1 - t) ** 1.6)
        col = color + (a,)
        draw.ellipse([cx - rx*(1-t), cy - ry*(1-t), cx + rx*(1-t), cy + ry*(1-t)],
                     fill=col)
# 主辉光（indigo）+ 次辉光（teal）错位
nebula(1010, 300, 360, 300, INDIGO, layers=80, maxa=46)
nebula(880, 230, 230, 200, TEAL, layers=60, maxa=34)

# ---- 星系螺旋（对数螺旋，双旋臂，渐变着色）----
gx, gy = 1010, 300
random.seed(7)
for arm in (0, math.pi):
    for i in range(520):
        t = i * 0.045
        r = 14 * math.exp(0.205 * t)
        ang = t + arm + random.uniform(-0.12, 0.12)
        x = gx + r * math.cos(ang)
        y = gy + r * math.sin(ang) * 0.92
        if not (0 <= x < W and 0 <= y < H):
            continue
        col = lerp(WHITE, lerp(INDIGO, TEAL, i/520), 0.55)
        a = int(180 * (1 - min(1, r/360)) ** 0.8)
        s = 1.6 if r < 120 else 1.0
        draw.ellipse([x-s, y-s, x+s, y+s], fill=col + (a,))
# 星系核
draw.ellipse([gx-16, gy-16, gx+16, gy+16], fill=(255,255,255,210))
draw.ellipse([gx-34, gy-34, gx+34, gy+34], fill=lerp(INDIGO, TEAL, 0.5)+(60,))

# ---- 流场曲线（低透明度 accent 弧线，自左向右掠过）----
random.seed(21)
for k in range(5):
    col = lerp(INDIGO, TEAL, k/4) + (26,)
    y0 = 120 + k*95 + random.uniform(-20,20)
    pts = []
    for x in range(-40, W+40, 40):
        y = y0 + 60*math.sin((x/240) + k*1.1) + 30*math.sin(x/90 + k)
        pts.append((x, y))
    for j in range(len(pts)-1):
        draw.line([pts[j], pts[j+1]], fill=col, width=2)

# ---- 星点 ----
random.seed(99)
for _ in range(520):
    x = random.randint(0, W); y = random.randint(0, H)
    # 文字区（左侧）少放星点，保证可读性
    if x < 640 and y > 330:
        if random.random() < 0.6:
            continue
    r = random.choice([0.7, 0.9, 1.1, 1.4])
    a = random.randint(60, 220)
    b = random.random()
    col = lerp((200,210,255),(255,255,255),b)
    draw.ellipse([x-r, y-r, x+r, y+r], fill=col+(a,))

# ---- 左侧暗化蒙版（提升文字可读性）----
scrim = Image.new("L", (W, H), 0)
sd = ImageDraw.Draw(scrim)
for x in range(700):
    a = int(150 * (1 - x/700) ** 1.4)
    sd.line([(x,0),(x,H)], fill=a)
scrim = scrim.filter(ImageFilter.GaussianBlur(40))
dark = Image.new("RGB", (W, H), (3,4,10))
img.paste(dark, (0,0), scrim)

# ---- 渐变文字助手 ----
def gradient_text(draw, xy, text, fnt, c1, c2, vertical=False):
    # 渲染文字为白色蒙版
    tmp = Image.new("RGBA", (W, H), (0,0,0,0))
    td = ImageDraw.Draw(tmp)
    td.text(xy, text, font=fnt, fill=(255,255,255,255))
    mask = tmp.split()[3]
    # 生成 1D 渐变并拉伸到全图
    if vertical:
        grad = Image.new("RGB", (1, H), c1)
        for y in range(H):
            grad.putpixel((0, y), lerp(c1, c2, y/H))
    else:
        grad = Image.new("RGB", (W, 1), c1)
        for x in range(W):
            grad.putpixel((x, 0), lerp(c1, c2, x/W))
    grad = grad.resize((W, H), Image.Resampling.BILINEAR)
    out = Image.new("RGB", (W, H))
    out.paste(grad, (0,0), mask)
    img.paste(out, (0,0), mask)
    return draw.textbbox(xy, text, font=fnt)

# ---- 文字排版 ----
# 品牌行
brand_f = font(FONT_HELV, 26, 1)
gradient_text(draw, (96, 96), "I M A G E   M Y T H O S", brand_f, INDIGO, TEAL)
draw.ellipse([70,103,86,119], fill=lerp(INDIGO,TEAL,0.5)+(255,))

# 主标题
title_f = font(FONT_HELV, 104, 1)
gradient_text(draw, (92, 150), "ImageMythos", title_f, WHITE, TEAL)

# 中文副标题
sub_f = font(FONT_CJK, 38, 0)
draw.text((98, 300), "把你的审美画像变成神性视觉", font=sub_f, fill=(232,236,251,255))

# 标签行（特性）
tag_f = font(FONT_CJK, 25, 0)
draw.text((98, 372), "8 维审美向量 → 星云 · 流场 · 星系", font=tag_f, fill=(174,184,218,255))
draw.text((98, 410), "出图 · 视频 · 3D · 一键分享卡", font=tag_f, fill=(174,184,218,255))

# 分隔线 + 域名
draw.rectangle([98, 470, 168, 474], fill=lerp(INDIGO,TEAL,0.5)+(255,))
dom_f = font(FONT_HELV, 26, 0)
draw.text((98, 486), "imagemythos.fun", font=dom_f, fill=lerp(INDIGO,TEAL,0.6))

img.save(OUT, "PNG")
print("saved", OUT, img.size)
