#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MusicXML -> 재생 타임라인 JSON 변환기 (해금 초견 프로 오디오 기능용).
gen_scores.py가 만든 MusicXML(단일 파트, divisions=12)을 읽어
피아노 가이드 재생·메트로놈·예비박·A-B 루프·블라인드 모드에 필요한
타임라인을 만든다. 장식음(grace)은 재생에서 제외하고, 타이(tie)는 합친다.
"""
import json, math, os, re, sys
import xml.etree.ElementTree as ET

STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

# 1단계: 비대칭 박자(5/8·7/8)의 메트로놈 그룹핑.
# 기본값(과제 지문): 5/8=3+2, 7/8=2+2+3.
# 단, 이 12곡의 실제 빔 묶음은 7/8이 3+2+2가 지배적이므로
# scores/pieces.json의 곡별 grouping이 있으면 그 값을 쓴다
# (build_scores.py PIECES에서 빔 실측으로 채움). pieces.json이 없으면 기본값.
GROUPING_DEFAULT = {"5/8": [3, 2], "7/8": [2, 2, 3]}


def load_piece_groupings(scores_dir):
    """pieces.json -> {곡번호: {"5/8": [...], "7/8": [...]}} (없으면 {})."""
    try:
        with open(os.path.join(scores_dir, "pieces.json"), encoding="utf-8") as f:
            data = json.load(f)
        arr = data if isinstance(data, list) else data.get("pieces", [])
        out = {}
        for p in arr:
            g = p.get("grouping") or {}
            if g:
                out[int(p["no"])] = {k: list(v) for k, v in g.items()}
        return out
    except (OSError, ValueError, KeyError, TypeError):
        return {}

def freq_of(midi):
    return round(440.0 * (2 ** ((midi - 69) / 12.0)), 2)

def parse_file(path, piece_grouping=None):
    grouping = dict(GROUPING_DEFAULT)
    if piece_grouping:
        grouping.update(piece_grouping)
    tree = ET.parse(path)
    root = tree.getroot()
    part = root.find('part')
    measures = part.findall('measure')
    divisions = 12
    notes = []          # {m, midi, freq, start_beat, dur_beats, beat_unit}
    tempos = []         # {measure, bpm, unit: 'quarter'|'dotted-quarter'}
    meters = []         # {measure, beats, beat_type}
    cur_bpm, cur_unit = 80, 'quarter'
    cur_beats, cur_btype = 4, 4
    # 누적 시간(박 단위). 박의 길이는 템포·박 단위에 따라 달라지므로
    # 일단 '쿼터박' 단위로 누적하고, 나중에 초로 변환한다.
    # 복합박자(6/8 등)는 점4분음표가 한 박이므로, 그 마디의 박 길이는 1.5 쿼터박.
    beat_pos_q = 0.0    # 쿼터박 기준 누적 위치
    for mi, m in enumerate(measures, 1):
        # attributes: divisions / time
        attrs = m.find('attributes')
        if attrs is not None:
            d = attrs.find('divisions')
            if d is not None:
                divisions = int(d.text)
            t = attrs.find('time')
            if t is not None:
                cur_beats = int(t.find('beats').text)
                cur_btype = int(t.find('beat-type').text)
                meters.append({'measure': mi, 'beats': cur_beats, 'beat_type': cur_btype})
        # directions: tempo words "♩ = 84" / "♩. = 69"
        for dirc in m.findall('direction'):
            for w in dirc.findall('direction-type/words'):
                txt = (w.text or '').strip()
                mm = re.match(r'^(♩\.?)\s*=\s*(\d+)$', txt)
                if mm:
                    cur_unit = 'dotted-quarter' if mm.group(1) == '♩.' else 'quarter'
                    cur_bpm = int(mm.group(2))
                    tempos.append({'measure': mi, 'bpm': cur_bpm, 'unit': cur_unit})
        if mi == 1 and not meters:
            meters.append({'measure': 1, 'beats': cur_beats, 'beat_type': cur_btype})
        if mi == 1 and not tempos:
            tempos.append({'measure': 1, 'bpm': cur_bpm, 'unit': cur_unit})
        # 이 마디의 한 박 길이(쿼터박 단위): 점4분음표 박이면 1.5, 4분음표 박이면 1.0
        beat_q = 1.5 if cur_unit == 'dotted-quarter' else 1.0
        m_start_q = beat_pos_q
        pos_q = m_start_q
        pending_tie = None   # 합칠 타이 음 (notes 리스트의 인덱스)
        for child in m:
            if child.tag == 'note':
                note = child
                is_grace = note.find('grace') is not None
                is_rest = note.find('rest') is not None
                is_chord = note.find('chord') is not None
                dur_el = note.find('duration')
                dur = int(dur_el.text) if dur_el is not None else 0
                dur_q = dur / divisions if divisions else 0
                if is_grace:
                    continue
                if is_rest:
                    if not is_chord:
                        pos_q += dur_q
                    continue
                p = note.find('pitch')
                step = p.find('step').text
                octv = int(p.find('octave').text)
                alter_el = p.find('alter')
                alter = int(alter_el.text) if alter_el is not None else 0
                midi = 12 * (octv + 1) + STEP[step] + alter
                tie_types = [t.get('type') for t in note.findall('tie')]
                start_q = pos_q if not is_chord else (notes[-1]['start_q'] if notes else pos_q)
                if 'stop' in tie_types and pending_tie is not None:
                    # 앞 음에 이어 붙인다 (같은 음정인 경우만 합침)
                    prev = notes[pending_tie]
                    if prev['midi'] == midi:
                        prev['dur_q'] += dur_q
                        if 'start' in tie_types:
                            pass  # 계속 이어짐
                        else:
                            pending_tie = None
                    else:
                        pending_tie = None
                else:
                    rec = {'m': mi, 'midi': midi, 'freq': freq_of(midi),
                           'start_q': start_q, 'dur_q': dur_q, 'beat_unit': cur_unit}
                    notes.append(rec)
                    if 'start' in tie_types:
                        pending_tie = len(notes) - 1
                if not is_chord:
                    pos_q += dur_q
            elif child.tag == 'forward':
                d = child.find('duration')
                if d is not None:
                    pos_q += int(d.text) / divisions
            elif child.tag == 'backup':
                d = child.find('duration')
                if d is not None:
                    pos_q -= int(d.text) / divisions
        beat_pos_q = m_start_q + (pos_q - m_start_q)
        # 마디 끝 위치를 박자 합으로 보정 (부족하면 다음 마디 시작을 박자 합만큼 이동)
        meter_q = cur_beats * (12 / cur_btype) / divisions * divisions / 12
        # 위 식은 복잡하므로 직접 계산: 한 마디 쿼터박 길이 = beats * (4/beat_type)
        meter_q = cur_beats * (4.0 / cur_btype)
        beat_pos_q = m_start_q + meter_q
    # ---- 쿼터박 위치를 초(1.0x 속도)로 변환 (템포 변화 반영) ----
    # 템포 구간: 각 템포가 적용되는 쿼터박 구간을 구한다.
    tempo_points = []  # (start_q, bpm, beat_q)
    for t in tempos:
        tempo_points.append(t)
    # 마디별 시작 쿼터박 위치를 다시 구한다 (meters/tempos와 함께)
    # 간단히: notes의 start_q를 이용해, 템포 경계(마디 시작)마다 누적 시간을 계산한다.
    # 마디 시작 쿼터박 위치 목록 (박자는 직전 마디 것을 이어받는다)
    m_start = {}
    q = 0.0
    last_mt = {'beats': 4, 'beat_type': 4}
    for mi in range(1, len(measures) + 1):
        m_start[mi] = q
        mt = next((x for x in meters if x['measure'] == mi), None)
        if mt:
            last_mt = mt
        q += last_mt['beats'] * (4.0 / last_mt['beat_type'])
    total_q = q
    # 템포 경계: 각 템포의 measure 시작 위치
    bounds = []
    for t in tempos:
        bounds.append((m_start.get(t['measure'], 0.0), t['bpm'], t['unit']))
    bounds.sort(key=lambda x: x[0])
    # q_to_sec를 쿼터박 기준으로 단순화 (템포는 4분음표 기준 bpm)
    def q_to_sec2(qpos):
        # 쿼터박 -> 초. 템포 bpm이 점4분음표 기준이면 4분음표 1개는 (60/bpm)/1.5초이다.
        sec = 0.0
        prev_q = 0.0
        bpm, unit = bounds[0][1], bounds[0][2]
        for bq, b, u in bounds:
            if qpos <= bq:
                break
            sec += (bq - prev_q) * (60.0 / bpm) / (1.5 if unit == 'dotted-quarter' else 1.0)
            prev_q, bpm, unit = bq, b, u
        sec += (qpos - prev_q) * (60.0 / bpm) / (1.5 if unit == 'dotted-quarter' else 1.0)
        return sec
    out_notes = []
    for n in notes:
        out_notes.append({
            'm': n['m'], 'midi': n['midi'], 'freq': n['freq'],
            'start': round(q_to_sec2(n['start_q']), 3),
            'dur': round(n['dur_q'] * (60.0 / 80), 3),  # 아래에서 템포 구간별로 다시 계산
        })
    # dur을 템포 구간별로 정확히 계산
    for i, n in enumerate(notes):
        s = q_to_sec2(n['start_q'])
        e = q_to_sec2(n['start_q'] + n['dur_q'])
        out_notes[i]['start'] = round(s, 3)
        out_notes[i]['dur'] = round(max(0.05, e - s), 3)
    total_sec = round(q_to_sec2(total_q), 2)
    # 마디별 시작 시간 (박자·템포는 직전 마디 것을 이어받는다)
    # 5/8·7/8 마디에는 grouping(8분음표 묶음, 예: [3, 2])도 함께 넣어
    # 메트로놈이 measure_starts만으로 강세 위치를 계산할 수 있게 한다.
    measure_starts = []
    last_mt = {'beats': 4, 'beat_type': 4}
    last_tp = {'bpm': 80, 'unit': 'quarter'}
    for mi in range(1, len(measures) + 1):
        mt = next((x for x in meters if x['measure'] == mi), None)
        if mt:
            last_mt = mt
        tp = next((x for x in tempos if x['measure'] == mi), None)
        if tp:
            last_tp = tp
        entry = {
            'm': mi, 'start': round(q_to_sec2(m_start[mi]), 3),
            'beats': last_mt['beats'], 'beat_type': last_mt['beat_type'],
            'bpm': last_tp['bpm'], 'unit': last_tp['unit'],
        }
        meter_label = f"{last_mt['beats']}/{last_mt['beat_type']}"
        if meter_label in grouping:
            entry['grouping'] = list(grouping[meter_label])
        measure_starts.append(entry)
    # 메트로놈 클릭 타임라인 (박 단위).
    # level: 2=마디 첫 박(강), 1=그룹 첫 박(중강), 0=그 외(약).
    # 'accent'는 하위 호환용으로 level==2와 같다.
    # - 복합박자(6/8·9/8·12/8): 점4분음표 단위 클릭, 그룹 첫 박 중강.
    # - 단순박자(2/4·3/4·4/4): 4분음표 단위 클릭, 첫 박만 강.
    # - 비대칭박자(5/8·7/8): grouping 경계에서만 클릭. 기존 로직은
    #   5/8을 2개 클릭(2+3 위치), 7/8을 4개 클릭(2+2+2+1 위치)으로
    #   만들었는데, 실제 빔 묶음(5/8=3+2, 7/8=3+2+2)과 달라 고쳤다.
    clicks = []
    for ms in measure_starts:
        meter_label = f"{ms['beats']}/{ms['beat_type']}"
        if ms['unit'] == 'dotted-quarter':
            n = int(round((ms['beats'] * (4.0 / ms['beat_type'])) / 1.5))
            offsets_q = [k * 1.5 for k in range(n)]
            levels = [2] + [1] * (n - 1)
        elif meter_label in grouping:
            groups = grouping[meter_label]
            offsets_q, levels = [], []
            pos = 0.0
            for gi, g in enumerate(groups):
                offsets_q.append(pos)
                levels.append(2 if gi == 0 else 1)
                pos += g * 0.5
        else:
            beat_len_q = 4.0 / ms['beat_type']
            n = ms['beats']
            offsets_q = [k * beat_len_q for k in range(n)]
            levels = [2] + [0] * (n - 1)
        for off_q, level in zip(offsets_q, levels):
            t = q_to_sec2(m_start[ms['m']] + off_q)
            clicks.append({'t': round(t, 3), 'm': ms['m'],
                           'accent': level == 2, 'level': level})
    # 예비박: 첫 마디 박자 수만큼. 단순박자는 분자 개수, 복합박자는 점4분음표 박 개수
    first = measure_starts[0]
    if first['unit'] == 'dotted-quarter':
        count_in_beats = int(round((first['beats'] * (4.0 / first['beat_type'])) / 1.5))
        count_in_click_q = 1.5
    else:
        count_in_beats = first['beats'] if first['beat_type'] == 8 else first['beats']
        count_in_click_q = 4.0 / first['beat_type']
    count_in_click_sec = round(count_in_click_q * (60.0 / first['bpm']) / (1.5 if first['unit'] == 'dotted-quarter' else 1.0), 3)
    return {
        'measures': len(measures),
        'total_sec': total_sec,
        'tempos': tempos,
        'meters': meters,
        'groupings': {k: list(v) for k, v in grouping.items()
                      if any(f"{ms['beats']}/{ms['beat_type']}" == k
                             for ms in measure_starts)},
        'measure_starts': measure_starts,
        'notes': out_notes,
        'clicks': clicks,
        'count_in': {'beats': count_in_beats, 'click_sec': count_in_click_sec,
                     'first_bpm': first['bpm'], 'first_unit': first['unit']},
    }

def main():
    scores_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/workspace/haegeum-sightreading-pro/scores')
    piece_groupings = load_piece_groupings(scores_dir)
    made = []
    for name in sorted(os.listdir(scores_dir)):
        if not name.endswith('.musicxml'):
            continue
        no = int(name[:3])
        data = parse_file(os.path.join(scores_dir, name),
                          piece_grouping=piece_groupings.get(no))
        out = os.path.join(scores_dir, f'{no:03d}.timeline.json')
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        made.append((no, len(data['notes']), data['total_sec'], data['count_in']))
        print(f"{no:03d}: 음 {len(data['notes'])}개, 총 {data['total_sec']}초, 예비박 {data['count_in']['beats']}박 x {data['count_in']['click_sec']}초, 템포 {data['tempos']}")
    print('완료:', len(made), '곡')

if __name__ == '__main__':
    main()
