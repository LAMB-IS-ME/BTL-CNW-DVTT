"""Compose unretouched real Playwright screenshots at 1:1, without device frames.
Run after all three grading-results browser specs; requires existing local Pillow, no app dependency.
GRADING_SCREENSHOT_DIR defaults to /tmp/grading-rollout/after.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import os

SOURCE = Path(os.environ.get('GRADING_SCREENSHOT_DIR', '/tmp/grading-rollout/after'))
TARGET = Path('docs/screenshots/grading-results-rollout')
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
    [panel('grading-detail-1440.png', '01 / Marking Desk · Bài làm, điểm và nhận xét'),
     panel('teacher-results-1440.png', '02 / Results Register · Kết quả sau lưu điểm')],
    [panel('results-page2-1440.png', '03 / Trang 2 · Phân trang và export toàn bài thi'),
     panel('student-released-1440.png', '04 / Result Record · Kết quả được phép công bố')],
], 'EXAMSPACE / Grading & Results / Full rollout',
    'Desktop 1440px · Chromium / API thật · Giữ composition đã duyệt',
    'review-board-desktop.png')

board([
    [panel('long-answer-390.png', '01 / Bài làm dài · Vùng đọc trên mobile'),
     panel('score-panel-390.png', '02 / Điểm và nhận xét · Đã lưu trên server')],
    [panel('results-records-390.png', '03 / Results Register · Bản ghi mobile'),
     panel('student-history-page2-320.png', '04 / Lịch sử trên 20 bài · Trang 2 ở 320px')],
    [panel('student-released-390.png', '05 / Result Record · Điểm và chi tiết'),
     panel('student-pending-390.png', '06 / Chờ chấm · Không công bố điểm')],
], 'EXAMSPACE / Grading & Results / Mobile',
    '390px và 320px · Ảnh ứng dụng thật · Kiểm tra thêm 1024px và 820px',
    'review-board-mobile.png')

board([
    [panel('dirty-dialog-1440.png', '01 / Draft chưa lưu · Ở lại hoặc xác nhận bỏ thay đổi', (300, 235, 1140, 740)),
     panel('grading-error-1440.png', '02 / Lưu thất bại · Giữ draft và thử lại', (144, 0, 1296, 1000)),
     panel('student-hidden-1440.png', '03 / Chưa công bố · Không có điểm hoặc đáp án', (250, 100, 1190, 650))],
    [panel('grading-page-105.png', '04 / Sau mốc 100 · Trang 6 / 105 lượt nộp', (0, 140, 320, 860)),
     panel('dirty-dialog-320.png', '05 / Xác nhận trên 320px', (0, 250, 320, 760)),
     panel('student-retry-320.png', '06 / Lỗi kết quả · Thử lại đúng request', (0, 0, 320, 500))],
], 'EXAMSPACE / Grading & Results / Evidence',
    'Draft / save error / pagination / release visibility / recovery · Không retouch nội dung',
    'evidence-states.png')
