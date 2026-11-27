#!/usr/bin/env python3
"""곡 카드 썸네일 생성 (해금 초견 프로 2단계 항목 14).

scores/NNN.png 에서 첫 단(첫 시스템)의 1~3마디만 잘라 scores/thumbs/NNN.png
으로 저장한다. 원본 PNG는 건드리지 않고 읽기만 한다.

왜 3마디인가:
  - 2마디는 조표·박자·선율 분위기를 읽기엔 정보가 적고,
  - 4마디 이상은 카드 썸네일 높이(96px)에서 음표가 너무 작아진다.
  - 첫 단 1~3마디는 조표·첫 박자·첫 프레이즈가 모두 들어간다.
  - 크롭 범위는 measure-boxes/NNN.json 의 마디 박스에서 직접 가져오므로
    곡마다 첫 단 마디 수가 달라도(5~8마디) 항상 정확히 1~3마디만 자른다.
"""
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOXDIR = os.path.join(BASE, "measure-boxes")
OUTDIR = os.path.join(BASE, "scores", "thumbs")
THUMB_W = 760
PAD_X = 12   # 좌우 여백 (px, 원본 기준)
PAD_TOP = 26  # 위 여백: 템포 기호·슬러가 잘리지 않게
PAD_BOT = 22  # 아래 여백: 다이내믹(mp 등)이 잘리지 않게

def main():
    os.makedirs(OUTDIR, exist_ok=True)
    for no in range(1, 13):
        pad = "%03d" % no
        boxes = json.load(open(os.path.join(BOXDIR, pad + ".json"), encoding="utf-8"))["boxes"]
        first3 = boxes[:3]
        img = Image.open(os.path.join(BASE, "scores", pad + ".png")).convert("RGB")
        W, H = img.size
        x0 = max(0, int(min(b["x0"] for b in first3) * W) - PAD_X)
        x1 = min(W, int(max(b["x1"] for b in first3) * W) + PAD_X)
        y0 = max(0, int(min(b["y0"] for b in first3) * H) - PAD_TOP)
        y1 = min(H, int(max(b["y1"] for b in first3) * H) + PAD_BOT)
        crop = img.crop((x0, y0, x1, y1))
        w, h = crop.size
        crop = crop.resize((THUMB_W, round(h * THUMB_W / w)), Image.LANCZOS)
        out = os.path.join(OUTDIR, pad + ".png")
        crop.save(out, optimize=True)
        print("#%02d thumb %s (%dx%d <- crop %dx%d)" % (no, out, crop.size[0], crop.size[1], x1 - x0, y1 - y0))

if __name__ == "__main__":
    main()
