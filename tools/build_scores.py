#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""해금 초견 연습 사이트(제2 사이트) 시범 12곡 빌드 스크립트.
Verovio 6.4.1 + Leland 렌더링. 직접 도형 그리기는 일절 하지 않는다.
~/workspace/haegeum-lounge-src/tools/gen_scores.py 의 build_piece /
validate_xml / render 를 그대로 쓰고, FONT_KR 경로만 이 VM의
NotoSansCJK-Regular.ttc 로 바꾼다.
후처리는 haegeum-gogeup-101-pretty/.src/verovio/build_101.py 로직을
일반화한 것이다:
  - trill: 고급곡은 전부 제거 후 46마디(없으면 가장 가까운 마디) 긴 음 1곳에만 부여 (기초/중급은 0개)
  - subito p와 같은 마디의 dynamics 겹침 정리 (101번 15마디식)
  - 슬러 시작점 교정: 빔 중간 시작 본슬러(number=1)를 빔 그룹 첫 음으로
    옮기고, 옮길 수 없으면 제거 (장식음 슬러 number=2는 건드리지 않음)
  - 전성 C~~~는 넣지 않는다.
venv: ~/workspace/.venv-verovio 로 실행한다.
출력: ../scores/001.png, 001.pdf, 001.musicxml ... 012.musicxml,
      ../scores/pieces.json, ../scores/validation.json
"""
import os, sys, json, re, io
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, "/home/hatch/workspace/haegeum-lounge-src/tools")
import gen_scores
import fitz  # PDF 페이지 수 확인용

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(BASE, "scores")
SVGDIR = os.path.join(BASE, "tools", "svg")
os.makedirs(OUTDIR, exist_ok=True)
os.makedirs(SVGDIR, exist_ok=True)

# 이 VM의 CJK 폰트 (원본 경로 /usr/share/fonts/pickle-hwp/... 는 없음)
gen_scores.FONT_KR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

DOCTYPE = ('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 '
           'Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">')
TRILL_MEASURE = 46  # 101번과 같은 기준 위치: 46마디 첫 긴 음 1곳. 없으면 가장 가까운 마디.

# 3단계: 자산 캐시 버스팅 버전. pieces.json의 version 필드와 PNG/PDF/MusicXML
# URL의 ?v=버전이 이 값을 쓴다. 악보를 다시 만들면 여기서 올린다.
ASSET_VERSION = 3

WATERMARK_LINES = ["해금 초견 프로 · 개인 연습 전용", "무단 복제 금지"]
WATERMARK_FONT_SIZE = 66
WATERMARK_ALPHA = 20  # 0~255. 악보를 가리지 않을 만큼 희미하게.


def apply_watermark(canvas):
    """Verovio 렌더링이 끝난 PNG 캔버스에 PIL 폰트 렌더링으로만 희미한
    대각선 워터마크를 덧씌운다. 직접 도형 그리기는 쓰지 않는다
    (텍스트 렌더링만). 악보 위를 가로지르되 alpha가 낮아 음표가 그대로 보인다."""
    W, H = canvas.size
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = ImageFont.truetype(gen_scores.FONT_KR, WATERMARK_FONT_SIZE)
    for line in WATERMARK_LINES:
        bb = draw.textbbox((0, 0), line, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        # 세 단으로 나눠 대각선 띠가 페이지 전체를 덮게 한다.
        # 두 줄은 위아래로 겹치지 않게 쌓는다 (줄마다 th+14 간격).
        li = WATERMARK_LINES.index(line)
        for k, fy in enumerate((0.28, 0.52, 0.76)):
            y = int(H * fy) + (k - 1) * (th + 26) - th // 2 + li * (th + 14)
            draw.text(((W - tw) / 2 - bb[0], y - bb[1]),
                      line, fill=(40, 40, 40, WATERMARK_ALPHA), font=font)
    overlay = overlay.rotate(-28, resample=Image.BICUBIC, center=(W / 2, H / 2))
    return Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

# ---------------------------------------------------------------- 1단계 패치
# (a) 마지막 단 하단 여백: gen_scores.render() 안의 spread_systems()는
#     bottom=160으로 마지막 오선을 페이지 맨 아래에 두는데, 9번 45마디처럼
#     마지막 단에 subito p + 크레셴도 헤어핀이 함께 오면 오선 아래 요소가
#     SVG 페이지 높이를 넘어 반쯤 잘린다. haegeum-lounge-src의
#     gen_scores.py는 건드리지 않고, 이 스크립트에서만 spread_systems를
#     bottom=260으로 감싸서 쓴다(마지막 단이 약 100단위 위로 올라가
#     subito p 전체가 페이지 안에 들어간다. 단 사이 간격은 470->450으로
#     소폭만 줄고, 1단 위치·A4 1페이지·7단은 그대로다).
_SPREAD_ORIG = gen_scores.spread_systems


def _spread_patched(svg, page_h, top=200, bottom=260):
    return _SPREAD_ORIG(svg, page_h, top=top, bottom=bottom)


gen_scores.spread_systems = _spread_patched

# (b) 악보 상단 헤더: gen_scores.render() 방식(PIL로 캔버스에 직접 글자)을
#     따라, 렌더된 PNG 위쪽에 제목 줄을 한 줄 덧붙인다.
#     "9번 · 변박의 불꽃 · ♩=84" — 곡 번호·곡명·초기 템포.
#     번호 박스·크레딧 줄 아래가 아니라 맨 위에 새 줄을 넣어 1단 템포와
#     겹치지 않게 한다. PDF는 새 캔버스로 다시 만든다(A4 세로 1페이지 유지).
HEADER_EXTRA = 88
HEADER_FONT_SIZE = 40


def render_with_header(xml2, no, outdir, cfg, total):
    png_out, pdf_out, size, svg = gen_scores.render(
        xml2, no, outdir, filename=f"{no:03d}", total=total, want_svg=True)
    first_meter = cfg["sections"][0][1]
    dotted = first_meter in ((6, 8), (9, 8), (12, 8))
    bpm0 = cfg["tempos"][1]
    tempo_txt = ("♩." if dotted else "♩") + f"={bpm0}"
    line = f"{no}번 · {cfg['title']} · {tempo_txt}"
    img = Image.open(png_out).convert("RGB")
    canvas = Image.new("RGB", (img.width, img.height + HEADER_EXTRA), "white")
    canvas.paste(img, (0, HEADER_EXTRA))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(gen_scores.FONT_KR, HEADER_FONT_SIZE)
    bb = draw.textbbox((0, 0), line, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.text(((canvas.width - tw) / 2 - bb[0],
               (HEADER_EXTRA - th) / 2 - bb[1]),
              line, fill="#111111", font=font)
    canvas = apply_watermark(canvas)  # 3단계: PNG·PDF 모두에 희미한 워터마크
    canvas.save(png_out, optimize=True)
    doc = fitz.open()
    page_w, page_h = 595, 842  # A4 세로 (캔버스는 항상 세로형)
    page = doc.new_page(width=page_w, height=page_h)
    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=92, subsampling=0, optimize=True)
    scale = min((page_w - 24) / canvas.width, (page_h - 24) / canvas.height)
    w, h = canvas.width * scale, canvas.height * scale
    page.insert_image(fitz.Rect((page_w - w) / 2, (page_h - h) / 2,
                                (page_w + w) / 2, (page_h + h) / 2),
                      stream=buf.getvalue())
    doc.save(pdf_out, deflate=True, garbage=4, clean=True)
    doc.close()
    return png_out, pdf_out, canvas.size, svg


# ---------------------------------------------------------------- 12곡 스펙
# grouping: 5/8·7/8 비대칭 박자의 빔 묶음 실측값(tools/make_timeline.py와
# 공유). 5/8은 4곡 모두 3+2, 7/8은 4곡 모두 3+2+2가 지배적이다.
# (과제 지문의 기본값 7/8=2+2+3과 다르다 — 실제 악보 빔이 3+2+2이므로
# 곡별 실측값을 쓴다. 기본값은 make_timeline.py의 GROUPING_DEFAULT 참조.)
# lines_adj: 10·12번은 원래 lines가 check_line_plan 경고를 냈다
# (4/4 한 줄 7마디). 규칙을 지키도록 줄 나눔만 조정했고, 그 외 스펙은 그대로다.
#   10번 원래 [7,7,7,7,7,7,6] -> [8,8,6,6,8,6,6] (박자 바뀜 15마디만 줄 중간)
#   12번 원래 [7,7,7,7,7,7,6] -> [7,7,8,8,6,6,6] (조바꿈 29마디만 줄 중간;
#        29마디를 줄 첫머리에 두면 29-48마디(20마디)를 3줄에 나눌 수 없어
#        4/4 6마디 규칙과 양립 불가하므로, 줄 중간 조바꿈을 택했다)
PIECES = [
    dict(no=1, bowing=True, level="기초", key="Eb", seed=401,
         sections=[(42, (4, 4))], lines=[6, 6, 6, 6, 6, 6, 6],
         tempos={1: 60}, dynamics={1: "mp"},
         title="첫 호흡, 긴 음", tags=["4/4", "E♭"]),
    dict(no=2, bowing=True, level="기초", key="Ab", seed=402,
         sections=[(42, (3, 4))], lines=[6, 6, 6, 6, 6, 6, 6],
         tempos={1: 66}, dynamics={1: "mp"},
         title="세 박자의 걸음", tags=["3/4", "A♭"]),
    dict(no=3, bowing=True, level="기초", key="Eb", seed=403,
         sections=[(40, (6, 8))], lines=[6, 6, 6, 6, 6, 5, 5],
         tempos={1: 69}, dynamics={1: "mf"},
         title="흔들리는 여섯 박", tags=["6/8", "E♭"]),
    dict(no=4, bowing=True, level="기초", key="Bb", seed=404,
         sections=[(18, (2, 4)), (24, (4, 4))], lines=[6, 6, 6, 6, 6, 6, 6],
         tempos={1: 72, 19: 80}, dynamics={1: "mp"},
         title="두 박에서 네 박으로", tags=["2/4", "4/4", "B♭", "변박"]),
    dict(no=5, bowing=True, level="중급", key="Eb", seed=405,
         sections=[(21, (5, 8)), (28, (3, 4))], lines=[7, 7, 7, 7, 7, 7, 7],
         tempos={1: 84, 22: 92}, dynamics={1: "mf"}, key_changes={22: "Ab"},
         subito=[15, 45], grouping={"5/8": [3, 2]},
         title="다섯 박의 파도", tags=["5/8", "3/4", "E♭", "A♭", "변박", "조바꿈"]),
    dict(no=6, bowing=True, level="중급", key="Ab", seed=406,
         sections=[(21, (7, 8)), (28, (6, 8))], lines=[7, 7, 7, 7, 7, 7, 7],
         tempos={1: 88, 22: 69}, dynamics={1: "mp"},
         subito=[15, 40], grouping={"7/8": [3, 2, 2]},
         title="일곱 박의 미로", tags=["7/8", "6/8", "A♭", "변박"]),
    dict(no=7, bowing=True, level="중급", key="Db", seed=407,
         sections=[(24, (9, 8)), (24, (4, 4))], lines=[8, 8, 8, 6, 6, 6, 6],
         tempos={1: 76, 25: 88}, dynamics={1: "mf"}, key_changes={25: "Ab"},
         subito=[20, 40],
         title="아홉 박의 질주", tags=["9/8", "4/4", "D♭", "A♭", "변박", "조바꿈"]),
    dict(no=8, bowing=True, level="중급", key="Bb", seed=408,
         sections=[(35, (12, 8))], lines=[5, 5, 5, 5, 5, 5, 5],
         tempos={1: 63}, dynamics={1: "mp"}, key_changes={21: "Eb"},
         subito=[18, 30],
         title="열두 박의 물결", tags=["12/8", "B♭", "E♭", "조바꿈"]),
    dict(no=9, bowing=True, level="고급", key="Eb", seed=409,
         sections=[(14, (5, 8)), (14, (3, 4)), (14, (5, 8)), (6, (4, 4))],
         lines=[7, 7, 7, 7, 7, 7, 6],
         tempos={1: 84, 15: 96, 29: 84, 43: 100}, dynamics={1: "mf"},
         key_changes={29: "Ab"}, subito=[15, 45], grouping={"5/8": [3, 2]},
         title="변박의 불꽃", tags=["5/8", "3/4", "4/4", "E♭", "A♭", "변박", "조바꿈"]),
    dict(no=10, bowing=True, level="고급", key="Ab", seed=410,
         sections=[(14, (7, 8)), (14, (4, 4)), (14, (7, 8)), (6, (4, 4))],
         lines=[8, 8, 6, 6, 8, 6, 6], lines_original=[7, 7, 7, 7, 7, 7, 6],
         tempos={1: 88, 15: 92, 29: 88, 43: 100}, dynamics={1: "f"},
         key_changes={29: "Db"}, subito=[12, 38], grouping={"7/8": [3, 2, 2]},
         title="엇박의 도전", tags=["7/8", "4/4", "A♭", "D♭", "변박", "조바꿈"]),
    dict(no=11, bowing=True, level="고급", key="Db", seed=411,
         sections=[(14, (5, 8)), (14, (7, 8)), (20, (6, 8))],
         lines=[7, 7, 7, 7, 7, 7, 6],
         tempos={1: 92, 15: 88, 29: 72}, dynamics={1: "mf"},
         key_changes={29: "Ab"}, subito=[18, 40],
         grouping={"5/8": [3, 2], "7/8": [3, 2, 2]},
         title="조바꿈의 파도", tags=["5/8", "7/8", "6/8", "D♭", "A♭", "변박", "조바꿈"]),
    dict(no=12, bowing=True, level="고급", key="Gb", seed=412,
         sections=[(14, (7, 8)), (14, (5, 8)), (20, (4, 4))],
         lines=[7, 7, 8, 8, 6, 6, 6], lines_original=[7, 7, 7, 7, 7, 7, 6],
         tempos={1: 80, 15: 84, 29: 92}, dynamics={1: "f"},
         key_changes={29: "Db"}, subito=[14, 36],
         grouping={"7/8": [3, 2, 2], "5/8": [3, 2]},
         title="종합 챌린지", tags=["7/8", "5/8", "4/4", "G♭", "D♭", "변박", "조바꿈"]),
]


# ---------------------------------------------------------------- 후처리
def _split_xml(xml):
    head, rest = xml.split("?>", 1)
    body = rest.replace(DOCTYPE, "")
    return head, ET.fromstring(body)


def _join_xml(head, root):
    return head + "?>" + DOCTYPE + "\n" + ET.tostring(root, encoding="unicode")


def _is_grace_target(notes, i):
    """i번 음 바로 앞에 장식음 무리가 있는가."""
    return i > 0 and notes[i - 1].find("grace") is not None


def _has_mordent(note):
    nots = note.find("notations")
    if nots is None:
        return False
    for orn in nots.findall("ornaments"):
        if orn.find("inverted-mordent") is not None:
            return True
    return False


def postprocess(xml, cfg):
    """build_101.py 후처리 일반화. (xml2, report) 반환."""
    head, root = _split_xml(xml)
    part = root.find("part")
    measures = part.findall("measure")
    total = sum(c for c, _ in cfg["sections"])
    assert len(measures) == total, f"measure {len(measures)} != {total}"
    rep = {}

    # --- trill: 전부 제거 후 고급곡만 46마디 1곳에 부여 (101번과 동일) ---
    trill_before = 0
    for m in measures:
        for note in m.findall("note"):
            nots = note.find("notations")
            if nots is None:
                continue
            for orn in nots.findall("ornaments"):
                for t in list(orn.findall("trill-mark")):
                    trill_before += 1
                    orn.remove(t)
    rep["trill_before"] = trill_before
    rep["trill_after"] = 0
    rep["trill_measure"] = None
    rep["trill_pitch"] = None
    rep["trill_mordent_removed"] = False
    if cfg["level"] == "고급":
        # 46마디에 긴 음이 없으면 45·47·44·48… 순으로 가장 가까운 마디를 찾는다.
        # (9번 46마디는 8분음표만, 11번 46마디는 점8분음표가 최장이라 46마디에 둘 수 없다)
        order = [TRILL_MEASURE]
        for d in (1, 2, 3, 4, 5):
            order += [TRILL_MEASURE - d, TRILL_MEASURE + d]
        order = [m for m in order if 1 <= m <= total]
        placed = False
        for tm in order:
            notes_tm = measures[tm - 1].findall("note")
            cands = []
            for i, note in enumerate(notes_tm):
                if note.find("grace") is not None or note.find("rest") is not None:
                    continue
                if int(note.find("duration").text) < 12:
                    continue
                cands.append((i, note))
            for i, note in cands:
                if not _has_mordent(note) and not _is_grace_target(notes_tm, i):
                    _add_trill(note)
                    rep["trill_pitch"] = _pitch_str(note)
                    rep["trill_measure"] = tm
                    placed = True
                    break
            if placed:
                break
            if cands:
                # 농현만 겹치는 첫 긴 음에서 농현을 떼고 trill 부여
                i, note = cands[0]
                nots = note.find("notations")
                if nots is not None:
                    for orn in nots.findall("ornaments"):
                        for md in list(orn.findall("inverted-mordent")):
                            orn.remove(md)
                            rep["trill_mordent_removed"] = True
                _add_trill(note)
                rep["trill_pitch"] = _pitch_str(note)
                rep["trill_measure"] = tm
                placed = True
                break
        assert placed, f"#{cfg['no']}: 46마디 근처에 trill을 둘 긴 음이 없음"
        rep["trill_after"] = 1

    # --- subito p / dynamics 겹침 정리: 모든 마디를 스캔 ---
    # subito p(words)가 있는 마디에 dynamics 방향이 함께 있으면 dynamics를 제거한다.
    removed_p = []
    for mi, m in enumerate(measures, 1):
        has_subito = False
        for d in m.findall("direction"):
            dt = d.find("direction-type")
            if dt is not None:
                w = dt.find("words")
                if w is not None and (w.text or "").strip() == "subito p":
                    has_subito = True
        if not has_subito:
            continue
        for d in list(m.findall("direction")):
            dt = d.find("direction-type")
            if dt is not None and dt.find("dynamics") is not None:
                dyn_names = [c.tag for c in dt.find("dynamics")]
                m.remove(d)
                removed_p.append({"measure": mi, "dynamics": dyn_names})
    rep["subito_p_removed"] = removed_p
    # subito p가 실제로 들어간 마디 (생성기가 고급곡에만 subito를 넣는다)
    rep["subito_p_measures"] = []
    for mi, m in enumerate(measures, 1):
        for d in m.findall("direction"):
            dt = d.find("direction-type")
            if dt is not None:
                w = dt.find("words")
                if w is not None and (w.text or "").strip() == "subito p":
                    rep["subito_p_measures"].append(mi)
    rep["c~~~_count"] = 0  # 전성은 넣지 않는다

    # --- 슬러 시작점 교정 (build_101 로직, 곡 일반화) ---
    moved, removed = [], []
    for mi, m in enumerate(measures, 1):
        notes = m.findall("note")
        group_first = {}
        cur = None
        for i, n in enumerate(notes):
            if n.find("grace") is not None:
                continue
            beams = {b.get("number"): b.text for b in n.findall("beam")}
            b1 = beams.get("1")
            if b1 == "begin":
                cur = i
                group_first[i] = i
            elif b1 in ("continue", "end"):
                group_first[i] = cur if cur is not None else i
            else:
                group_first[i] = i
        open_start = None
        for i, n in enumerate(notes):
            nots = n.find("notations")
            if nots is None:
                continue
            for s in list(nots.findall("slur")):
                if s.get("number") != "1":
                    continue
                if s.get("type") == "start":
                    open_start = i
                elif s.get("type") == "stop" and open_start is not None:
                    f = group_first.get(open_start)
                    if f is not None and f != open_start:
                        first_note = notes[f]
                        first_nots = first_note.find("notations")
                        has_start = False
                        if first_nots is not None:
                            has_start = any(
                                x.get("type") == "start" and x.get("number") == "1"
                                for x in first_nots.findall("slur"))
                        if (first_note.find("rest") is not None
                                or first_note.find("grace") is not None or has_start):
                            nots.remove(s)
                            start_nots = notes[open_start].find("notations")
                            for x in list(start_nots.findall("slur")):
                                if x.get("type") == "start" and x.get("number") == "1":
                                    start_nots.remove(x)
                            removed.append({"measure": mi, "start_idx": open_start,
                                            "stop_idx": i})
                        else:
                            if first_nots is None:
                                first_nots = ET.SubElement(first_note, "notations")
                            ET.SubElement(first_nots, "slur",
                                          {"type": "start", "placement": "above",
                                           "number": "1"})
                            start_nots = notes[open_start].find("notations")
                            for x in list(start_nots.findall("slur")):
                                if x.get("type") == "start" and x.get("number") == "1":
                                    start_nots.remove(x)
                            moved.append({"measure": mi, "from_idx": open_start,
                                          "to_idx": f, "stop_idx": i})
                    open_start = None
    rep["slur_moved"] = moved
    rep["slur_removed"] = removed
    return _join_xml(head, root), rep


def _add_trill(note):
    nots = note.find("notations")
    if nots is None:
        nots = ET.SubElement(note, "notations")
    orn = nots.find("ornaments")
    if orn is None:
        orn = ET.SubElement(nots, "ornaments")
    ET.SubElement(orn, "trill-mark")


def _pitch_str(note):
    p = note.find("pitch")
    if p is None:
        return None
    step = p.find("step").text
    octv = p.find("octave").text
    alt = p.find("alter")
    acc = {"-1": "♭", "1": "♯"}.get(alt.text if alt is not None else "0", "")
    return f"{step}{acc}{octv}"


# ---------------------------------------------------------------- 검증
def _beam_group_first(notes):
    group_first = {}
    cur = None
    for i, n in enumerate(notes):
        if n.find("grace") is not None:
            continue
        beams = {b.get("number"): b.text for b in n.findall("beam")}
        b1 = beams.get("1")
        if b1 == "begin":
            cur = i
            group_first[i] = i
        elif b1 in ("continue", "end"):
            group_first[i] = cur if cur is not None else i
        else:
            group_first[i] = i
    return group_first


def validate_final(xml, svg, pdf_path, png_path):
    """5개 규칙 검증. SVG 기하 겹침은 검사 불가함을 별도 명시한다."""
    head, root = _split_xml(xml)
    measures = root.find("part").findall("measure")
    v = {}

    # 규칙 1: 빔 중간 시작 본슬러(number=1) 수
    mid_slur = 0
    mid_detail = []
    for mi, m in enumerate(measures, 1):
        notes = m.findall("note")
        gf = _beam_group_first(notes)
        for i, n in enumerate(notes):
            nots = n.find("notations")
            if nots is None:
                continue
            for s in nots.findall("slur"):
                if s.get("number") == "1" and s.get("type") == "start":
                    if gf.get(i, i) != i:
                        mid_slur += 1
                        mid_detail.append({"measure": mi, "note_idx": i,
                                           "beam_group_first_idx": gf.get(i)})
    v["rule1_beam_mid_slur_start"] = {"count": mid_slur, "detail": mid_detail}

    # 규칙 2: 쉼표 가로지르는 슬러 수 (number 1·2 모두)
    rest_cross = 0
    rest_detail = []
    for mi, m in enumerate(measures, 1):
        notes = m.findall("note")
        for num in ("1", "2"):
            open_idx = None
            for i, n in enumerate(notes):
                nots = n.find("notations")
                if nots is None:
                    continue
                for s in nots.findall("slur"):
                    if s.get("number") != num:
                        continue
                    if s.get("type") == "start":
                        open_idx = i
                    elif s.get("type") == "stop" and open_idx is not None:
                        if any(notes[k].find("rest") is not None
                               for k in range(open_idx + 1, i)):
                            rest_cross += 1
                            rest_detail.append({"measure": mi, "number": num,
                                                "start_idx": open_idx, "stop_idx": i})
                        open_idx = None
    v["rule2_slur_crossing_rest"] = {"count": rest_cross, "detail": rest_detail}

    # 규칙 3: 시김새 겹침 (MusicXML 검사)
    both = 0
    both_detail = []
    grace_orn = 0
    grace_detail = []
    for mi, m in enumerate(measures, 1):
        notes = m.findall("note")
        for i, n in enumerate(notes):
            nots = n.find("notations")
            if nots is None:
                continue
            has_trill = has_mord = False
            for orn in nots.findall("ornaments"):
                if orn.find("trill-mark") is not None:
                    has_trill = True
                if orn.find("inverted-mordent") is not None:
                    has_mord = True
            if has_trill and has_mord:
                both += 1
                both_detail.append({"measure": mi, "note_idx": i,
                                    "pitch": _pitch_str(n)})
            is_grace = n.find("grace") is not None
            is_target = _is_grace_target(notes, i)
            if (is_grace or is_target) and (has_trill or has_mord):
                grace_orn += 1
                grace_detail.append({"measure": mi, "note_idx": i,
                                     "kind": "grace" if is_grace else "grace_target",
                                     "pitch": _pitch_str(n),
                                     "trill": has_trill, "mordent": has_mord})
    v["rule3_ornament_overlap"] = {
        "trill_plus_mordent_same_note": {"count": both, "detail": both_detail},
        "ornament_on_grace_group": {"count": grace_orn, "detail": grace_detail},
        "note": "MusicXML 검사만 수행. SVG 기하 겹침(기호끼리 화면에서 겹치는지)은 "
                "이 검증에서 검사 불가.",
    }

    # 규칙 4: 박자/조바꿈 시 줄 끝 예고표 — SVG meterSig 수 vs 실제 박자표 수
    ns = "{http://www.w3.org/2000/svg}"
    sroot = ET.fromstring(svg)
    meter_sigs = [e for e in sroot.iter() if e.attrib.get("class") == "meterSig"]
    # 실제 박자표 수 = sections 수 (박자가 바뀌는 구간마다 1개)
    v["rule4_meterSig"] = {"svg_count": len(meter_sigs), "expected": None,
                           "excess": None}

    # 규칙 5: 번호 박스+크레딧+하단 문구 — render()가 넣으므로 PDF 1페이지·PNG 존재로 확인
    pdf_pages = None
    if pdf_path and os.path.exists(pdf_path):
        with fitz.open(pdf_path) as doc:
            pdf_pages = doc.page_count
    v["rule5_box_credit_footer"] = {
        "pdf_pages": pdf_pages,
        "png_exists": bool(png_path and os.path.exists(png_path)),
        "png_bytes": os.path.getsize(png_path) if png_path and os.path.exists(png_path) else 0,
        "note": "번호 박스·우상단 크레딧·하단 문구는 gen_scores.render()가 "
                "PNG/PDF에 직접 그린다. 이 규칙은 PDF 1페이지와 PNG 존재로 확인한다.",
    }
    return v


def pitch_range(xml):
    """본음(장식음 제외) 음역. midi 최소/최대와 음이름."""
    _, root = _split_xml(xml)
    lo = hi = None
    lo_p = hi_p = None
    for m in root.find("part").findall("measure"):
        for n in m.findall("note"):
            if n.find("grace") is not None or n.find("rest") is not None:
                continue
            p = n.find("pitch")
            midi = gen_scores.midi_of(p.find("step").text,
                                      int(p.find("octave").text),
                                      int(p.find("alter").text) if p.find("alter") is not None else 0)
            if lo is None or midi < lo:
                lo, lo_p = midi, _pitch_str(n)
            if hi is None or midi > hi:
                hi, hi_p = midi, _pitch_str(n)
    return {"min_midi": lo, "min_pitch": lo_p, "max_midi": hi, "max_pitch": hi_p}


def meter_key_lists(cfg):
    meters = []
    for _c, mt in cfg["sections"]:
        label = gen_scores.METER_LABEL[mt]
        if label not in meters:
            meters.append(label)
    keys = [cfg["key"]]
    for _mnum, k in sorted((cfg.get("key_changes") or {}).items()):
        if k not in keys:
            keys.append(k)
    return meters, keys


def main():
    pieces_out = []
    validation_out = {"generated_by": "tools/build_scores.py",
                      "verovio": "6.4.1 + Leland (gen_scores.render)",
                      "font_kr": gen_scores.FONT_KR,
                      "rules_note": "규칙 3의 SVG 기하 겹침은 검사 불가. "
                                    "규칙 4의 excess>0이면 줄 끝 예고표(cautionary)가 "
                                    "있다는 뜻이다.",
                      "pieces": []}
    for cfg in PIECES:
        no = cfg["no"]
        total = sum(c for c, _ in cfg["sections"])
        lines_orig = cfg.get("lines_original", list(cfg["lines"]))
        cfg_orig = dict(cfg, lines=lines_orig)
        warn_orig = gen_scores.check_line_plan(cfg_orig)
        warn_final = gen_scores.check_line_plan(cfg)
        print(f"#{no} {cfg['title']}: check_line_plan 원래={warn_orig} 최종={warn_final}",
              flush=True)

        xml, builder, _mxs = gen_scores.build_piece(
            cfg, breaks_at=gen_scores.line_breaks(cfg))
        print(f"#{no} features: {sorted(builder.features)}", flush=True)
        gen_scores.validate_xml(xml, cfg)
        xml2, rep = postprocess(xml, cfg)
        gen_scores.validate_xml(xml2, cfg)
        print(f"#{no} 후처리: trill {rep['trill_before']}->{rep['trill_after']} "
              f"({rep['trill_measure']}마디 {rep['trill_pitch']}), 슬러 옮김 {len(rep['slur_moved'])} "
              f"제거 {len(rep['slur_removed'])}, subito p 제거 {rep['subito_p_removed']}",
              flush=True)

        mx_path = os.path.join(OUTDIR, f"{no:03d}.musicxml")
        with open(mx_path, "w", encoding="utf-8") as f:
            f.write(xml2)

        png_out, pdf_out, size, svg = render_with_header(
            xml2, no, OUTDIR, cfg, total)
        with open(os.path.join(SVGDIR, f"{no:03d}.svg"), "w", encoding="utf-8") as f:
            f.write(svg)
        print(f"#{no} render: {png_out} {pdf_out} {size}", flush=True)

        meters, keys = meter_key_lists(cfg)
        val = validate_final(xml2, svg, pdf_out, png_out)
        val["rule4_meterSig"]["expected"] = len(cfg["sections"])
        val["rule4_meterSig"]["excess"] = (val["rule4_meterSig"]["svg_count"]
                                           - len(cfg["sections"]))
        rng = pitch_range(xml2)
        ns = "{http://www.w3.org/2000/svg}"
        sroot = ET.fromstring(svg)
        systems = [g for g in sroot.iter(f"{ns}g") if g.attrib.get("class") == "system"]

        pieces_out.append({
            "no": no, "title": cfg["title"], "level": cfg["level"],
            "key": cfg["key"], "key_changes": {str(k): v for k, v in
                                               (cfg.get("key_changes") or {}).items()},
            "meters": meters, "bars": total,
            "tempos": {str(k): v for k, v in cfg["tempos"].items()},
            "tags": cfg["tags"], "lines": list(cfg["lines"]),
            "lines_original": lines_orig, "seed": cfg["seed"],
            "sections": [[c, gen_scores.METER_LABEL[mt]] for c, mt in cfg["sections"]],
            "subito": cfg.get("subito", []),
            "grouping": cfg.get("grouping", {}),
            "files": {"png": f"{no:03d}.png", "pdf": f"{no:03d}.pdf",
                      "musicxml": f"{no:03d}.musicxml"},
        })
        validation_out["pieces"].append({
            "no": no, "title": cfg["title"], "level": cfg["level"],
            "bars": total, "meters": meters, "keys": keys,
            "range": rng,
            "lines": list(cfg["lines"]), "lines_original": lines_orig,
            "check_line_plan_original_warnings": warn_orig,
            "check_line_plan_final_warnings": warn_final,
            "systems_in_svg": len(systems),
            "system_measure_counts": gen_scores.system_measure_counts(xml2),
            "postprocess": rep,
            "validation": val,
            "features": sorted(builder.features),
            "files": {"png": f"{no:03d}.png", "pdf": f"{no:03d}.pdf",
                      "musicxml": f"{no:03d}.musicxml"},
        })

    with open(os.path.join(OUTDIR, "pieces.json"), "w", encoding="utf-8") as f:
        # 3단계: version 필드 추가. app.js가 읽어 PNG/PDF/MusicXML/timeline URL에
        # ?v=버전을 붙인다 (캐시 버스팅). 구버전 app.js도 {pieces} 형태를 읽는다.
        json.dump({"version": ASSET_VERSION, "pieces": pieces_out},
                  f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUTDIR, "validation.json"), "w", encoding="utf-8") as f:
        json.dump(validation_out, f, ensure_ascii=False, indent=1)
    print("pieces.json / validation.json 저장 완료")


if __name__ == "__main__":
    main()
