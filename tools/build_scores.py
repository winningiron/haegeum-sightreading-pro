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
import os, sys, json, re
import xml.etree.ElementTree as ET

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

# ---------------------------------------------------------------- 12곡 스펙
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
         subito=[15, 45],
         title="다섯 박의 파도", tags=["5/8", "3/4", "E♭", "A♭", "변박", "조바꿈"]),
    dict(no=6, bowing=True, level="중급", key="Ab", seed=406,
         sections=[(21, (7, 8)), (28, (6, 8))], lines=[7, 7, 7, 7, 7, 7, 7],
         tempos={1: 88, 22: 69}, dynamics={1: "mp"},
         subito=[15, 40],
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
         key_changes={29: "Ab"}, subito=[15, 45],
         title="변박의 불꽃", tags=["5/8", "3/4", "4/4", "E♭", "A♭", "변박", "조바꿈"]),
    dict(no=10, bowing=True, level="고급", key="Ab", seed=410,
         sections=[(14, (7, 8)), (14, (4, 4)), (14, (7, 8)), (6, (4, 4))],
         lines=[8, 8, 6, 6, 8, 6, 6], lines_original=[7, 7, 7, 7, 7, 7, 6],
         tempos={1: 88, 15: 92, 29: 88, 43: 100}, dynamics={1: "f"},
         key_changes={29: "Db"}, subito=[12, 38],
         title="엇박의 도전", tags=["7/8", "4/4", "A♭", "D♭", "변박", "조바꿈"]),
    dict(no=11, bowing=True, level="고급", key="Db", seed=411,
         sections=[(14, (5, 8)), (14, (7, 8)), (20, (6, 8))],
         lines=[7, 7, 7, 7, 7, 7, 6],
         tempos={1: 92, 15: 88, 29: 72}, dynamics={1: "mf"},
         key_changes={29: "Ab"}, subito=[18, 40],
         title="조바꿈의 파도", tags=["5/8", "7/8", "6/8", "D♭", "A♭", "변박", "조바꿈"]),
    dict(no=12, bowing=True, level="고급", key="Gb", seed=412,
         sections=[(14, (7, 8)), (14, (5, 8)), (20, (4, 4))],
         lines=[7, 7, 8, 8, 6, 6, 6], lines_original=[7, 7, 7, 7, 7, 7, 6],
         tempos={1: 80, 15: 84, 29: 92}, dynamics={1: "f"},
         key_changes={29: "Db"}, subito=[14, 36],
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

        png_out, pdf_out, size, svg = gen_scores.render(
            xml2, no, OUTDIR, filename=f"{no:03d}", total=total, want_svg=True)
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
        json.dump(pieces_out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUTDIR, "validation.json"), "w", encoding="utf-8") as f:
        json.dump(validation_out, f, ensure_ascii=False, indent=1)
    print("pieces.json / validation.json 저장 완료")


if __name__ == "__main__":
    main()
