"""Compose unretouched real Playwright screenshots at 1:1, without device frames.
Run after grading-results.spec.ts; requires existing local Pillow, no app dependency.
GRADING_SCREENSHOT_DIR defaults to /tmp/grading-results-after.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import os

SOURCE = Path(os.environ.get('GRADING_SCREENSHOT_DIR', '/tmp/grading-results-after'))
TARGET = Path('docs/screenshots/grading-results-prototype')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
GAP, LABEL, HEADER = 24, 88, 112
TARGET.mkdir(parents=True, exist_ok=True)


def panel(file, label, crop=None):
    im = Image.open(SOURCE / file).convert('RGB')
    return (im.crop(crop) if crop else im), label


def caption(draw, label, x, y, width, size):
    font = ImageFont.truetype(FONT, size)
    lines, line = [], ''
    for word in label.split():
        candidate = f'{line} {word}'.strip()
        if draw.textlength(candidate, font=font) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    lines.append(line)
    assert len(lines) <= 3, label
    draw.multiline_text((x, y + 8), '\n'.join(lines), font=font, spacing=5, fill='#252c2a')


def board(columns, title, subtitle, filename):
    widths = [max(im.width for im, _ in col) for col in columns]
    heights = [sum(im.height + LABEL + GAP for im, _ in col) for col in columns]
    image = Image.new('RGB', (sum(widths) + GAP * (len(columns) + 1), HEADER + GAP + max(heights)), '#e9e8e0')
    draw = ImageDraw.Draw(image)
    draw.text((GAP, 22), title, font=ImageFont.truetype(FONT, 30), fill='#252c2a')
    draw.text((GAP, 69), subtitle, font=ImageFont.truetype(FONT, 17), fill='#535e59')
    x = GAP
    for col, width in zip(columns, widths):
        y = HEADER + GAP
        for im, label in col:
            caption(draw, label, x, y, width, 20 if width < 500 else 25)
            image.paste(im, (x, y + LABEL))
            y += im.height + LABEL + GAP
        x += width + GAP
    image.save(TARGET / filename)
    print(filename, image.size)


board([
    [panel('grading-entry-1440.png', '01 / Marking Desk · Danh sách lượt nộp'),
     panel('teacher-results-1440.png', '03 / Results Register · Điểm, trạng thái, công bố và export')],
    [panel('grading-detail-1440.png', '02 / Chấm tự luận · Toàn bộ bài làm và vùng nhập điểm'),
     panel('student-released-1440.png', '04 / Result Record · Kết quả đã công bố')],
], 'EXAMSPACE / Grading & Results / Desktop',
    'Thin-slice prototype · Chromium 1440px · Ảnh app thật 1:1 · Shared shell giữ nguyên',
    'review-board-desktop.png')

board([
    [panel('grading-detail-390.png', '01 / Bài làm và chấm điểm · Reflow một cột')],
    [panel('score-panel-390.png', '02 / Đã lưu · Ngữ cảnh sinh viên ngay trên điểm'),
     panel('results-records-390.png', '03 / Kết quả giáo viên · Bản ghi trên mobile')],
    [panel('student-released-390.png', '04 / Sinh viên · Điểm và chi tiết được phép xem'),
     panel('student-hidden-390.png', '05 / Chưa công bố · Không có điểm hoặc đáp án', (0, 175, 390, 670))],
], 'EXAMSPACE / Grading & Results / Mobile',
    '390px · Ảnh app thật 1:1 · Đã kiểm tra thêm 820px',
    'review-board-mobile.png')

board([
    [panel('student-pending-1440.png', '01 / Đã nộp · Chờ chấm tự luận', (250, 100, 1190, 580)),
     panel('student-hidden-1440.png', '02 / Đã chấm · Chưa công bố', (250, 100, 1190, 580)),
     panel('student-entry-1440.png', '03 / Results entry · Danh sách bài thi hiện có', (250, 100, 1190, 700))],
    [panel('analytics-1440.png', '04 / Phân tích hiện hữu · Disclosure sau danh sách', (140, 0, 1300, 1000)),
     panel('student-feedback-1440.png', '05 / Chi tiết câu tự luận · Nhận xét được công bố', (250, 0, 1190, 750))],
], 'EXAMSPACE / Grading & Results / State evidence',
    'API/DB test thật · Không retouch nội dung · Không thêm analytics hoặc release policy',
    'evidence-states.png')
