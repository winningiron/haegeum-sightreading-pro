#!/usr/bin/env python3
"""Verovio SVG -> 마디별 bounding box 추출 (해금 초견 프로 2단계 항목 5).

tools/svg/NNN.svg 의 <g class="measure"> 를 순수 Python 으로 수치 파싱해
PNG 좌표(분수, 0..1)로 변환한 measure-boxes/NNN.json 을 만든다.

좌표 매핑 (build_scores.py + gen_scores.render() 에서 확인):
  - PNG 는 동일 SVG 를 resvg zoom=3 으로 래스터화한 뒤 18px씩 자르고,
    좌우 85px·위 135px·아래 118px 패딩 캔버스에 붙인 뒤, 상단 헤더 88px을
    덧붙인 것이다. (최종 2093x3074)
  - SVG 바깥 viewBox 0 0 653 923, 안쪽 definition-scale viewBox 0 0 22500 31820.
  - 따라서 PNG 픽셀 = 바깥 viewBox 좌표 * 3 + (67, 205)
    (x: -18 crop + 85 pad = +67 / y: -18 + 135 pad + 88 header = +205)
  - 검증: 001번 오선 1행 y=379(회색)·391~427(검정), 오선 x 111~1981 과
    공식 계산값이 일치한다.
  - <use>·<defs> 글리프, translate/scale/rotate, 중첩 <svg> viewBox를 모두
    처리한다. visibility:hidden placeholder 와 배경 rect(100%)는 제외한다.

사용법: python3 tools/extract_measure_boxes.py [--verify-only]
  --verify-only: JSON 재생성 없이 /tmp/verify_001.png, /tmp/verify_009.png 만
  다시 그려 마디 박스 정렬을 눈으로 확인한다.
"""
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVGDIR = os.path.join(BASE, "tools", "svg")
OUTDIR = os.path.join(BASE, "measure-boxes")
PNG_W, PNG_H = 2093, 3074
ZOOM = 3.0
OFF_X, OFF_Y = 67.0, 205.0  # crop(-18)+pad_side(85), crop(-18)+pad_top(135)+header(88)
NS = "{http://www.w3.org/2000/svg}"
XLINK = "{http://www.w3.org/1999/xlink}href"

# ---------------------------------------------------------------- affine
IDENT = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)  # a,b,c,d,e,f : x'=a*x+c*y+e, y'=b*x+d*y+f

def compose(t1, t2):
    """t1 o t2 (t2를 먼저 적용)."""
    a1, b1, c1, d1, e1, f1 = t1
    a2, b2, c2, d2, e2, f2 = t2
    return (a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
            a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
            a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1)

def apply_t(t, x, y):
    a, b, c, d, e, f = t
    return (a * x + c * y + e, b * x + d * y + f)

_NUM = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"

def parse_transform(s):
    if not s:
        return IDENT
    t = IDENT
    for name, args in re.findall(r"([a-zA-Z]+)\s*\(([^)]*)\)", s):
        vals = [float(v) for v in re.findall(_NUM, args)]
        if name == "translate":
            tx = vals[0] if vals else 0.0
            ty = vals[1] if len(vals) > 1 else 0.0
            m = (1, 0, 0, 1, tx, ty)
        elif name == "scale":
            sx = vals[0] if vals else 1.0
            sy = vals[1] if len(vals) > 1 else sx
            m = (sx, 0, 0, sy, 0, 0)
        elif name == "rotate":
            ang = math.radians(vals[0]) if vals else 0.0
            co, si = math.cos(ang), math.sin(ang)
            if len(vals) >= 3:
                cx, cy = vals[1], vals[2]
                m = compose((1, 0, 0, 1, cx, cy),
                            compose((co, si, -si, co, 0, 0), (1, 0, 0, 1, -cx, -cy)))
            else:
                m = (co, si, -si, co, 0, 0)
        elif name == "matrix":
            m = tuple(vals[:6]) if len(vals) >= 6 else IDENT
        elif name == "skewX":
            m = (1, 0, math.tan(math.radians(vals[0])), 1, 0, 0)
        elif name == "skewY":
            m = (1, math.tan(math.radians(vals[0])), 0, 1, 0, 0)
        else:
            continue
        # transform 목록은 왼쪽부터 쓴 순서대로 '나중에' 적용된다:
        # translate(a) scale(b) 는 T∘S, 즉 scale을 먼저 적용한다.
        # compose(t, m) = t∘m 이므로 누적은 t = compose(t, m) 이다.
        # (반대로 compose(m, t) 로 하면 translate까지 scale되어 좌표가 틀어진다.)
        t = compose(t, m)
    return t

# ---------------------------------------------------------------- path
_TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|" + _NUM)
_ARITY = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}

def path_points(d):
    """path d 의 모든 좌표점(제어점 포함)을 (x, y) 리스트로. 상대좌표·반복 처리."""
    toks = _TOKEN.findall(d or "")
    pts, cur, start, cmd = [], (0.0, 0.0), (0.0, 0.0), None
    i, n = 0, len(toks)
    while i < n:
        tok = toks[i]
        if tok.isalpha():
            cmd = tok
            i += 1
            if cmd in "Zz":
                cur = start
                continue
        elif cmd is None:
            i += 1
            continue
        up, rel = cmd.upper(), cmd.islower()
        ar = _ARITY[up]
        if up == "M" and pts:
            pass
        # 명령 반복: 좌표가 더 있으면 같은 명령 반복 (M 반복은 L로)
        first = True
        while i + ar <= n and not toks[i].isalpha():
            vals = [float(v) for v in toks[i:i + ar]]
            i += ar
            eff = cmd
            if up == "M" and not first:
                eff = "L" if rel else "l"
                up, rel = eff.upper(), eff.islower()
            if up == "H":
                x = vals[0] + (cur[0] if rel else 0.0)
                cur = (x, cur[1])
                pts.append(cur)
            elif up == "V":
                y = vals[0] + (cur[1] if rel else 0.0)
                cur = (cur[0], y)
                pts.append(cur)
            elif up == "A":
                x = vals[5] + (cur[0] if rel else 0.0)
                y = vals[6] + (cur[1] if rel else 0.0)
                cur = (x, y)
                pts.append(cur)
            else:
                pairs = [(vals[j], vals[j + 1]) for j in range(0, len(vals), 2)]
                for (px, py) in pairs:
                    if rel:
                        px, py = px + cur[0], py + cur[1]
                    pts.append((px, py))
                cur = pts[-1]
                if up == "M":
                    start = cur
            first = False
        if up == "M" and not first:
            pass
    return pts

# ---------------------------------------------------------------- bbox
def bbox_of_points(pts, t):
    xs, ys = [], []
    for (x, y) in pts:
        px, py = apply_t(t, x, y)
        xs.append(px)
        ys.append(py)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))

def union(b1, b2):
    if b1 is None:
        return b2
    if b2 is None:
        return b1
    return (min(b1[0], b2[0]), min(b1[1], b2[1]),
            max(b1[2], b2[2]), max(b1[3], b2[3]))

def _f(v, default=0.0):
    if v is None:
        return default
    v = str(v).strip()
    if v.endswith("px"):
        v = v[:-2]
    try:
        return float(v)
    except (TypeError, ValueError):
        return default

class Extractor:
    def __init__(self, root):
        self.root = root
        self.defs = {}  # id -> element
        for el in root.iter():
            i = el.attrib.get("id")
            if i:
                self.defs[i] = el

    def skip(self, el):
        cls = el.attrib.get("class", "")
        # 주의: <g class="page-margin"> 은 전체 내용을 감싸므로 제외하면 안 된다.
        if "placeholder" in cls:
            return True
        if el.attrib.get("style", "").replace(" ", "").find("visibility:hidden") >= 0:
            return True
        return False

    def bbox(self, el, t):
        """el 의 bbox 를 t 가 적용된 좌표계로. defs 안은 직접 세지 않는다."""
        tag = el.tag
        if tag == NS + "defs" or tag == NS + "style" or tag == NS + "desc":
            return None
        if self.skip(el):
            return None
        t = compose(t, parse_transform(el.attrib.get("transform", "")))
        if tag == NS + "path":
            return bbox_of_points(path_points(el.attrib.get("d", "")), t)
        if tag == NS + "polygon" or tag == NS + "polyline":
            vals = [float(v) for v in re.findall(_NUM, el.attrib.get("points", ""))]
            pts = [(vals[i], vals[i + 1]) for i in range(0, len(vals) - 1, 2)]
            return bbox_of_points(pts, t)
        if tag == NS + "ellipse":
            cx, cy, rx, ry = (_f(el.attrib.get(k)) for k in ("cx", "cy", "rx", "ry"))
            return bbox_of_points([(cx - rx, cy - ry), (cx + rx, cy + ry)], t)
        if tag == NS + "circle":
            cx, cy, r = (_f(el.attrib.get(k)) for k in ("cx", "cy", "r"))
            return bbox_of_points([(cx - r, cy - r), (cx + r, cy + r)], t)
        if tag == NS + "rect":
            w, h = el.attrib.get("width", ""), el.attrib.get("height", "")
            if "%" in w or "%" in h:
                return None
            x, y = _f(el.attrib.get("x")), _f(el.attrib.get("y"))
            return bbox_of_points([(x, y), (x + _f(w), y + _f(h))], t)
        if tag == NS + "line":
            x1, y1 = _f(el.attrib.get("x1")), _f(el.attrib.get("y1"))
            x2, y2 = _f(el.attrib.get("x2")), _f(el.attrib.get("y2"))
            return bbox_of_points([(x1, y1), (x2, y2)], t)
        if tag == NS + "text":
            return self.text_bbox(el, t)
        if tag == NS + "use":
            href = el.attrib.get("href") or el.attrib.get(XLINK) or ""
            ref = self.defs.get(href.lstrip("#")) if href.startswith("#") else None
            if ref is None:
                return None
            ut = compose(t, (1, 0, 0, 1, _f(el.attrib.get("x")), _f(el.attrib.get("y"))))
            return self.bbox(ref, ut)
        if tag == NS + "svg":
            # 중첩 svg: viewBox -> viewport 매핑
            vb = el.attrib.get("viewBox")
            if vb:
                nums = [float(v) for v in re.findall(_NUM, vb)]
                if len(nums) == 4:
                    _, _, vbw, vbh = nums
                    vw = self._len(el.attrib.get("width"), 653.0)
                    vh = self._len(el.attrib.get("height"), 923.0)
                    m = compose((1, 0, 0, 1, 0, 0),
                                (vw / vbw if vbw else 1, 0, 0, vh / vbh if vbh else 1, 0, 0))
                    t = compose(t, m)
            out = None
            for ch in el:
                out = union(out, self.bbox(ch, t))
            return out
        out = None
        for ch in el:
            out = union(out, self.bbox(ch, t))
        return out

    @staticmethod
    def _len(v, default):
        if v is None:
            return default
        if v.endswith("%"):
            return default * float(v[:-1]) / 100.0
        try:
            return float(v)
        except ValueError:
            return default

    def text_bbox(self, el, t):
        # font-size: text 자체가 0px 이고 tspan 에 실제 크기가 있는 경우가 있다.
        fs = None
        for ts in el.iter(NS + "tspan"):
            v = ts.attrib.get("font-size")
            if v:
                fs = _f(v)
                break
        if fs is None or fs <= 0:
            fs = _f(el.attrib.get("font-size"), 350.0)
        # 보이는 글자만 센다 (들여쓰기 공백까지 세면 폭이 수백 배로 부푼다).
        txt = "".join("".join(ts.itertext()) for ts in el.iter(NS + "tspan"))
        if not txt.strip():
            txt = "".join(el.itertext())
        txt = "".join(txt.split())
        x = _f(el.attrib.get("x"))
        y = _f(el.attrib.get("y"))
        for ts in el.iter(NS + "tspan"):
            if "x" in ts.attrib:
                x = _f(ts.attrib.get("x"))
            if "y" in ts.attrib:
                y = _f(ts.attrib.get("y"))
            break
        w = max(len(txt), 1) * fs * 0.55
        if el.attrib.get("text-anchor") == "middle":
            x0, x1 = x - w / 2.0, x + w / 2.0
        elif el.attrib.get("text-anchor") == "end":
            x0, x1 = x - w, x
        else:
            x0, x1 = x, x + w
        return bbox_of_points([(x0, y - fs * 0.8), (x1, y + fs * 0.25)], t)

def extract(no):
    pad = "%03d" % no
    path = os.path.join(SVGDIR, pad + ".svg")
    tree = ET.parse(path)
    root = tree.getroot()
    ex = Extractor(root)
    # 조상 transform 을 누적하면서 한 번만 순회한다. ex.bbox(el, IDENT) 를
    # 마디에 직접 호출하면 page-margin/system/definition-scale 변환이 빠져
    # 좌표가 틀리므로, 반드시 누적 transform 을 넘겨야 한다.
    boxes = []          # (bbox_outer, sys_idx)
    staff_tops = {}     # sys_idx -> 첫 staff 첫 path 의 상단 y (바깥 좌표)
    systems_seen = []

    def walk(el, t_acc):
        # 이 요소의 자식들에게 적용될 누적 transform
        t_here = compose(t_acc, parse_transform(el.attrib.get("transform", "")))
        if el.tag == NS + "svg" and el.attrib.get("viewBox"):
            nums = [float(v) for v in re.findall(_NUM, el.attrib.get("viewBox"))]
            if len(nums) == 4:
                _, _, vbw, vbh = nums
                vw = Extractor._len(el.attrib.get("width"), 653.0)
                vh = Extractor._len(el.attrib.get("height"), 923.0)
                m = (vw / vbw if vbw else 1, 0, 0, vh / vbh if vbh else 1, 0, 0)
                t_here = compose(t_here, m)
        cls = el.attrib.get("class", "")
        if el.tag == NS + "g" and cls == "system":
            systems_seen.append(el)
        if el.tag == NS + "g" and cls == "measure":
            b = ex.bbox(el, t_acc)
            if b is None:
                raise RuntimeError("%s: 마디 bbox 없음" % pad)
            sys_idx = len(systems_seen) - 1
            sxx = None
            for st in el.iter(NS + "g"):
                if st.attrib.get("class") == "staff":
                    for p in st.iter(NS + "path"):
                        bb = ex.bbox(p, t_here)
                        if bb is not None:
                            sxx = (bb[0], bb[2])
                        break
                    break
            boxes.append((b, sys_idx, sxx))
            # staff 최상단: 마디 안 첫 staff 그룹의 첫 path 상단.
            # (walk가 마디에서 return하므로 여기서 함께 처리해야 한다.)
            if sys_idx not in staff_tops and sxx is not None:
                for st in el.iter(NS + "g"):
                    if st.attrib.get("class") == "staff":
                        for p in st.iter(NS + "path"):
                            bb = ex.bbox(p, t_here)
                            if bb is not None:
                                staff_tops[sys_idx] = bb[1]
                            break
                        break
            return  # 마디 내부는 더 내려가지 않는다 (bbox 가 이미 포함)
        for ch in el:
            if ch.tag in (NS + "defs", NS + "style", NS + "desc"):
                continue
            walk(ch, t_here)

    walk(root, IDENT)
    out_boxes = []
    for (b, si, sxx) in boxes:
        x0 = (b[0] * ZOOM + OFF_X) / PNG_W
        y0 = (b[1] * ZOOM + OFF_Y) / PNG_H
        x1 = (b[2] * ZOOM + OFF_X) / PNG_W
        y1 = (b[3] * ZOOM + OFF_Y) / PNG_H
        box = {
            "x0": round(max(0.0, x0), 4), "y0": round(max(0.0, y0), 4),
            "x1": round(min(1.0, x1), 4), "y1": round(min(1.0, y1), 4),
            "sys": si,
        }
        if sxx is not None:
            # 클릭 판정용 오선 x범위: 슬러·헤어핀이 이웃 마디까지 뻗어 잉크 박스가
            # 겹치므로, 클릭은 오선 자체 구간으로만 판정한다 (겹침 없음).
            box["sx0"] = round(max(0.0, (sxx[0] * ZOOM + OFF_X) / PNG_W), 4)
            box["sx1"] = round(min(1.0, (sxx[1] * ZOOM + OFF_X) / PNG_W), 4)
        out_boxes.append(box)
    staff_png = [round((staff_tops[i] * ZOOM + OFF_Y), 1) if i in staff_tops else None
                 for i in range(len(systems_seen))]
    return {"no": no, "measures": len(out_boxes), "boxes": out_boxes,
            "staffTopsPng": staff_png}

def main():
    verify_only = "--verify-only" in sys.argv
    pieces = json.load(open(os.path.join(BASE, "scores", "pieces.json"), encoding="utf-8"))
    expected = {p["no"]: p["bars"] for p in pieces}
    if not verify_only:
        os.makedirs(OUTDIR, exist_ok=True)
        for no in sorted(expected):
            data = extract(no)
            assert data["measures"] == expected[no], \
                "%d번: 마디 %d개, 기대 %d개" % (no, data["measures"], expected[no])
            # 단위 검증: sys 단조 증가, 같은 단 안에서는 x0 증가
            prev_sys, prev_x0 = -1, -1.0
            for b in data["boxes"]:
                assert b["sys"] >= prev_sys, "%d번: sys 역전" % no
                if b["sys"] == prev_sys:
                    assert b["x0"] >= prev_x0 - 0.001, "%d번: 같은 단에서 x 역전" % no
                assert 0 <= b["x0"] < b["x1"] <= 1 and 0 <= b["y0"] < b["y1"] <= 1, \
                    "%d번: 박스 범위 이상 %s" % (no, b)
                prev_sys, prev_x0 = b["sys"], b["x0"]
            with open(os.path.join(OUTDIR, "%03d.json" % no), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            print("#%02d: %d마디, %d단, staffTops=%s" %
                  (no, data["measures"], max(b["sys"] for b in data["boxes"]) + 1,
                   data["staffTopsPng"]))
    # 검증 오버레이: 001번·009번 PNG 위에 박스를 그려 눈으로 확인
    from PIL import Image, ImageDraw
    for no in (1, 9):
        data = json.load(open(os.path.join(OUTDIR, "%03d.json" % no), encoding="utf-8"))
        img = Image.open(os.path.join(BASE, "scores", "%03d.png" % no)).convert("RGB")
        dr = ImageDraw.Draw(img, "RGBA")
        for i, b in enumerate(data["boxes"]):
            x0, y0 = b["x0"] * PNG_W, b["y0"] * PNG_H
            x1, y1 = b["x1"] * PNG_W, b["y1"] * PNG_H
            dr.rectangle([x0, y0, x1, y1], fill=(217, 164, 65, 60),
                         outline=(200, 120, 0, 255), width=3)
            dr.text((x0 + 4, y0 + 2), str(i + 1), fill=(200, 0, 0))
        out = "/tmp/verify_%03d.png" % no
        img.save(out)
        print("overlay:", out)

if __name__ == "__main__":
    main()
