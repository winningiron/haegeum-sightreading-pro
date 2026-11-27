# 해금 초견 프로 — HAEGEUM SIGHT-READING PRO

현대 창작국악 · 고난도 초견 챌린지. 기존 `winningiron/haegeum-lounge`와는 완전히 다른 스타일·기능의 제2 연습 사이트입니다. 기존 저장소는 건드리지 않았습니다.

## 콘셉트
- 모던 다크 스튜디오: 깊은 차콜/먹색 배경 + 금빛/옥색 포인트, 악보 본문은 미색/아이보리 종이 톤. 다크/라이트 전환 토글 지원.
- 태블릿·모바일 보면대 최적화: "집중 연습 뷰"로 상단 툴바를 최소화하고 악보가 화면을 꽉 채웁니다.

## 악보 (시범 12곡)
- 모든 악보는 **Verovio 6.4.1 + Leland 폰트**로 렌더링했습니다. 직접 도형 그리기는 쓰지 않았습니다.
- A4 세로 1페이지, PNG + PDF + MusicXML (`scores/001~012.*`).
- 사보 검증 규칙: ① 빔 중간 시작 슬러 금지 ② 쉼표 가로지르는 슬러 금지 ③ 시김새 겹침 0건 ④ 박자/조바꿈 줄 끝 예고표 ⑤ 번호 박스 + 우상단 `LEE SEUNG CHUL (with AI)` / 하단 `무단 복제 및 배포를 절대 금합니다.`
- 검증 결과는 `scores/validation.json`을 보세요. 빌드 스크립트는 `tools/build_scores.py`입니다.
- 조표 분포: E♭·A♭ 중심, B♭·D♭·G♭ 단계별 배치. 5/8·7/8 혼합박자, 조바꿈, 넓은 도약, subito p·cresc. 대비가 돋보이는 오리지널 연습곡입니다.

## 오디오 · 실전 연습 (Web Audio, 모두 동작)
- **곡별 타임라인**: 모든 곡에 MusicXML(`scores/*.musicxml`)과 재생 타임라인(`scores/*.timeline.json`, 음높이·음가·템포 변화·박자 변화·메트로놈 클릭·예비박 포함)이 함께 저장되어 있습니다. 생성기: `tools/make_timeline.py` (MusicXML → 타임라인 변환, 장식음 제외·타이 합침, 점4분음표 템포 보정 포함).
- **피아노 가이드 멜로디 재생**: 타임라인을 그대로 읽어 피아노 톤(Web Audio, 배음 합성)으로 재생. 템포 변화(예: 84→96→100)와 박자 변화를 그대로 반영하고, 속도 조절(0.75x / 0.85x / 1.0x) 및 현재 연주 중인 마디 번호 표시를 지원합니다.
- **예비박(카운트인) + 메트로놈 결합 재생**: 바로 시작하지 않고 첫 마디 박자만큼(5/8이면 5박, 4/4면 4박, 6/8이면 점4분음표 2박) "강-약-약..." 예비박을 먼저 친 뒤 본곡 시작. 3가지 모드: [피아노 + 메트로놈] / [예비박 + 메트로놈만 (피아노 OFF)] / [피아노만].
- **어려운 마디 구간 반복 (A-B 루프)**: 시작 마디~끝 마디(예: 15~22마디)를 지정해 느린 템포(0.75x 등)로 무한 반복 연습합니다. 구간 시작 마디의 박자·템포로 예비박을 다시 계산합니다.
- **입시 실전 블라인드 → 정답 확인 모드**: [블라인드 실전 모드]를 누르면 악보를 가리고 30초 눈으로 초견 읽기 → 종료 시 자동으로 예비박 후 메트로놈만 재생(피아노 무음) → 연주 종료 후 [정답 피아노로 듣기] 버튼으로 음정·리듬을 확인합니다.
- **해금 조율 기준음 & 첫 음 미리 듣기**: A4(440Hz) 기준음과 곡의 으뜸음(E♭/A♭ 등) 지속음 재생 버튼, 첫 음 미리 듣기 버튼.

## 기능 (모두 동작)
1. **입시 실전 모드**: 곡을 열고 버튼을 누르면 30초 미리보기(초견 읽기) 카운트다운 후 연습 시작 알림음이 울립니다.
2. **내장 메트로놈 & 기준음**: Web Audio로 구현. 곡 템포가 자동 세팅되고, 첫 박 강조음이 있습니다. 기준음 A4=440Hz 및 곡 으뜸음(E♭/A♭ 등) 재생 버튼.
3. **오늘의 모의고사**: 기초·중급·고급에서 랜덤 3곡을 묶어 연속으로 풉니다.
4. **진도 체크 & 개인 메모**: 완료 체크, 연습 횟수, 어려웠던 마디 메모를 localStorage에 자동 저장합니다.
5. **태그 기반 필터**: 난이도 외에 조표(E♭/A♭/B♭/D♭/G♭), 박자(5/8, 7/8, 4/4, 변박, 조바꿈) 필터링.

## 로컬 확인
```bash
cd haegeum-sightreading-pro
python3 -m http.server 8000
# http://localhost:8000 으로 열기
```

## GitHub Pages 배포 방법
이 VM의 `gh`는 로그인되어 있지 않아 저장소를 자동 생성할 수 없었습니다. 아래 중 하나로 배포하세요.

**방법 A — GitHub 웹사이트에서 직접 만들기 (권장)**
1. github.com → New repository → 이름 `haegeum-sightreading-pro` (Public) → Create
2. 이 폴더 내용을 업로드하거나, 로컬에서:
```bash
cd haegeum-sightreading-pro
git init
git add .
git commit -m "해금 초견 프로 시범 12곡"
git branch -M main
git remote add origin https://github.com/winningiron/haegeum-sightreading-pro.git
git push -u origin main
```
3. 저장소 Settings → Pages → Source를 `Deploy from a branch`, Branch `main` / `/ (root)`로 설정 → 저장
4. 배포 링크: https://winningiron.github.io/haegeum-sightreading-pro/

**방법 B — gh CLI로 만들기**
```bash
gh auth login
gh repo create winningiron/haegeum-sightreading-pro --public --source=. --push
# 이후 위 방법 A의 3번과 같이 Pages를 켜세요.
```
