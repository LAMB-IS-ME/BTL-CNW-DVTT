"""Compose only real browser captures. No device frames or synthetic UI.
Usage: python3 tests/ui/live-quiz-boards.py [capture-root] [output-dir]
"""
from pathlib import Path
import sys
import json
import hashlib
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/live-quiz-audit')
out = Path(sys.argv[2] if len(sys.argv) > 2 else 'docs/screenshots/live-quiz-prototype')
out.mkdir(parents=True, exist_ok=True)
def font(size, bold=False):
    return ImageFont.truetype(('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'), size)
manifest = []

def tile(state, width, label, crop, phase='after', size=None):
    path = root / phase / 'chromium' / str(width) / f'{state}.png'
    source = Image.open(path).convert('RGB')
    x1, y1, x2, y2 = crop
    if y2 is None:
        y2 = source.height - 92
    assert 0 <= x1 < x2 <= source.width and 0 <= y1 < y2 <= source.height, (path, crop, source.size)
    picture = source.crop((x1, y1, x2, y2))
    if size:
        picture = picture.resize((size, round(picture.height * size / picture.width)), Image.Resampling.LANCZOS)
    manifest.append({'source': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'label': label, 'crop': [x1,y1,x2,y2], 'displaySize': picture.size})
    return label, picture

def board(name, title, subtitle, items, columns, cellwidth):
    gap, margin = 28, 32
    rows = [items[i:i+columns] for i in range(0, len(items), columns)]
    heights = [max(im.height for _, im in row) + 58 for row in rows]
    canvas = Image.new('RGB', (margin*2+columns*cellwidth+(columns-1)*gap, 130+sum(heights)+len(rows)*gap+margin), '#eeeFE9')
    d = ImageDraw.Draw(canvas)
    d.text((margin,25), title, font=font(30,True), fill='#252c2a')
    d.text((margin,75), subtitle, font=font(17), fill='#535e59')
    y=130
    for row, height in zip(rows, heights):
        for i,(label,im) in enumerate(row):
            x=margin+i*(cellwidth+gap)
            d.line((x,y,x+cellwidth,y), fill='#24574e',width=2)
            d.text((x,y+12), label, font=font(18,True), fill='#252c2a')
            canvas.paste(im,(x,y+52))
        y+=height+gap
    canvas.save(out/name, optimize=True)

board('review-board-desktop.png', 'ExamSpace / Live Quiz — Desktop prototype',
      'Session Control · Teacher   /   Live Response · Student   |   Real Chromium captures · 1440px', [
    tile('teacher-lobby',1440,'01  Teacher / Lobby · 2 người tham gia',(144,106,1296,730)),
    tile('student-waiting',1440,'02  Student / Đã vào phòng · Chờ bắt đầu',(282,106,1158,560)),
    tile('teacher-active',1440,'03  Teacher / Câu đang mở · Participants',(144,106,1296,760)),
    tile('student-question',1440,'04  Student / Câu hỏi và lựa chọn',(282,106,1158,None)),
    tile('teacher-leaderboard',1440,'05  Teacher / Reveal · Điều khiển câu tiếp theo',(144,106,1296,None)),
    tile('student-submitted',1440,'06  Student / Server đã nhận câu trả lời',(282,106,1158,None)),
],2,1152)

board('review-board-mobile.png','ExamSpace / Live Quiz — Mobile prototype',
      '390px · Nội dung app thật, bỏ navigation chung khỏi crop · Không device frame',[
    tile('student-join',390,'01  Nhập mã',(0,188,390,None)),
    tile('student-waiting',390,'02  Chờ giảng viên',(0,188,390,None)),
    tile('student-question',390,'03  Trả lời câu hỏi',(0,188,390,None)),
    tile('student-submitted',390,'04  Đã nhận câu trả lời',(0,188,390,None)),
    tile('student-finished',390,'05  Kết quả cuối cùng',(0,188,390,655)),
    tile('teacher-leaderboard',390,'06  Teacher / Chuyển câu',(0,188,390,560)),
],3,390)

board('evidence-states.png','ExamSpace / Live Quiz — State evidence',
      'BEFORE và AFTER được ghi riêng · Cùng app / transport thật · Không tạo state giả',[
    tile('student-question',1440,'BEFORE / Student · Tiêu đề lấn câu hỏi',(144,106,1296,800),'before',size=1000),
    tile('teacher-lobby',1440,'BEFORE / Teacher · Lobby chung composition',(144,106,1296,675),'before',size=1000),
    tile('teacher-entry',1440,'AFTER / Teacher · Chọn Quiz',(144,106,1296,680),size=1000),
    tile('student-join',1440,'AFTER / Student · Nhập mã phòng',(240,106,1200,620),size=960),
    tile('student-disconnected',1440,'AFTER / Mất kết nối · Giữ nội dung gần nhất',(282,106,1158,None),size=876),
    tile('student-join-rejected',1440,'AFTER / Server từ chối tham gia phòng',(282,106,1158,500),size=876),
],2,1000)
(out/'board-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Created', ', '.join(p.name for p in out.glob('*.png')))
