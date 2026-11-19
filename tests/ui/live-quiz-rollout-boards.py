"""Compose real Playwright captures without altering app pixels.
Usage: python3 tests/ui/live-quiz-rollout-boards.py [capture-root] [output-dir]
Run the lifecycle and compatibility suites first (compatibility supplies the
representative three-item library instead of accumulated lifecycle fixtures).
"""
from pathlib import Path
import hashlib
import json
import math
import sys
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/live-quiz-rollout')
out = Path(sys.argv[2] if len(sys.argv) > 2 else 'docs/screenshots/live-quiz-rollout')
out.mkdir(parents=True, exist_ok=True)
manifest = []

def font(size, bold=False):
    return ImageFont.truetype(('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'), size)

def region_bottom(width, state, selector):
    evidence = json.loads((root / 'after' / 'chromium' / str(width) / 'evidence.json').read_text())
    capture = next(c for c in evidence['captures'] if c['name'] == state)
    r = capture['regions'][selector]
    return math.ceil(r['y'] + r['height']) + 4

def tile(state, width, label, phase='after', crop=None, maxwidth=None, surface=True, folder=None):
    path = root / phase / 'chromium' / (folder or str(width)) / f'{state}{"-surface" if surface else ""}.png'
    picture = Image.open(path).convert('RGB')
    source_size = picture.size
    if crop:
        x1,y1,x2,y2 = crop
        x2 = x2 or picture.width
        y2 = min(y2 or picture.height, picture.height)
        assert 0 <= x1 < x2 <= picture.width and 0 <= y1 < y2 <= picture.height, (path,crop,picture.size)
        crop = (x1,y1,x2,y2)
        picture = picture.crop(crop)
    if maxwidth and picture.width > maxwidth:
        picture = picture.resize((maxwidth, round(picture.height * maxwidth / picture.width)), Image.Resampling.LANCZOS)
    manifest.append({'source': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'label':label, 'sourceSize':source_size, 'crop':crop, 'displaySize':picture.size})
    return label,picture

def board(name,title,subtitle,items,columns,cellwidth):
    gap,margin = 28,32
    rows = [items[i:i+columns] for i in range(0,len(items),columns)]
    heights = [max(im.height for _,im in row)+56 for row in rows]
    canvas = Image.new('RGB',(margin*2+columns*cellwidth+(columns-1)*gap,132+sum(heights)+len(rows)*gap+margin),'#eeefe9')
    d=ImageDraw.Draw(canvas)
    d.text((margin,24),title,font=font(30,True),fill='#252c2a')
    d.text((margin,75),subtitle,font=font(17),fill='#535e59')
    y=132
    for row,height in zip(rows,heights):
        for i,(label,picture) in enumerate(row):
            x=margin+i*(cellwidth+gap)
            d.line((x,y,x+cellwidth,y),fill='#24574e',width=2)
            d.text((x,y+12),label,font=font(18,True),fill='#252c2a')
            canvas.paste(picture,(x,y+52))
        y+=height+gap
    canvas.save(out/name,optimize=True)

board('review-board-desktop.png','ExamSpace / Live Quiz · Full rollout',
      '1440px · Session Control / Live Response · Real application captures',[
    tile('teacher-entry',1440,'01 Teacher / Thư viện Quiz'),
    tile('student-join',1440,'02 Student / Tham gia phòng'),
    tile('teacher-lobby',1440,'03 Teacher / Mở phiên cùng lớp'),
    tile('student-waiting',1440,'04 Student / Phòng chờ'),
    tile('teacher-active',1440,'05 Teacher / Câu hỏi và điều phối'),
    tile('student-question',1440,'06 Student / Đọc và trả lời'),
    tile('teacher-leaderboard',1440,'07 Teacher / Reveal và câu tiếp theo'),
    tile('student-finished',1440,'08 Student / Kết quả cuối cùng',crop=(0,0,None,region_bottom(1440,'student-finished','.lq-ranking'))),
],2,1136)

board('review-board-mobile.png','ExamSpace / Live Quiz · Mobile',
      '390px · App surfaces, shared navigation excluded · No device frames',[
    tile('student-join',390,'01 Tham gia'),
    tile('student-waiting',390,'02 Phòng chờ'),
    tile('student-question',390,'03 Câu hỏi'),
    tile('student-selected',390,'04 Đã chọn'),
    tile('student-submitted',390,'05 Server đã nhận'),
    tile('student-leaderboard',390,'06 Reveal / Xếp hạng'),
    tile('student-finished',390,'07 Kết quả cuối cùng',crop=(0,0,None,region_bottom(390,'student-finished','.lq-ranking'))),
    tile('teacher-leaderboard',390,'08 Teacher / Chuyển câu',crop=(0,0,None,region_bottom(390,'teacher-leaderboard','.lq-control'))),
],4,358)

board('visual-before-after.png','ExamSpace / Live Quiz · Visual refinement',
      'LEFT: reviewed prototype / RIGHT: rollout · Same state and viewport · Equivalent real fixture data',[
    tile('teacher-active',1440,'BEFORE / Teacher active',phase='before',surface=False,crop=(144,106,1296,768),maxwidth=1000),
    tile('teacher-active',1440,'AFTER / Teacher active',surface=False,crop=(144,106,1296,768),maxwidth=1000),
    tile('student-question',1440,'BEFORE / Student question',phase='before',surface=False,crop=(282,106,1158,914)),
    tile('student-question',1440,'AFTER / Student question',surface=False,crop=(282,106,1158,914)),
    tile('student-submitted',1440,'BEFORE / Submission acknowledgement',phase='before',surface=False,crop=(282,106,1158,914)),
    tile('student-submitted',1440,'AFTER / Submission acknowledgement',surface=False,crop=(282,106,1158,914)),
],2,1000)

board('evidence-states.png','ExamSpace / Live Quiz · Recovery & edge states',
      '390px · Real delayed/dropped ACK and failed-request scenarios · No fabricated server states',[
    tile('join-pending',390,'01 Join / Chờ ACK',folder='hardening'),
    tile('join-timeout',390,'02 Join / Chưa xác nhận',folder='hardening'),
    tile('join-recovered',390,'03 Join / Kết nối lại',folder='hardening'),
    tile('library-empty',390,'04 Library / Trống',folder='hardening'),
    tile('library-error',390,'05 Library / Lỗi tải',folder='hardening'),
    tile('student-disconnected',390,'06 Student / Mất kết nối'),
],3,358)

(out/'board-manifest.json').write_text(json.dumps({'captureRoot':'.','pixelPolicy':'Crop/compose real screenshots only; no UI retouching or synthetic states.','items':manifest},ensure_ascii=False,indent=2)+'\n')
print('Created four rollout boards and provenance manifest.')
