"""Compose Focus Desk boards from unretouched Playwright screenshots at 1:1.

Run after student-focus.spec.ts; FOCUS_SCREENSHOT_DIR defaults to /tmp/focus-after.
Requires the existing local Pillow tool, not a project/runtime dependency.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import os

SOURCE = Path(os.environ.get('FOCUS_SCREENSHOT_DIR', '/tmp/focus-after'))
ROLLOUT = os.environ.get('FOCUS_BOARD_PHASE') == 'rollout'
TARGET = Path('docs/screenshots/student-focus-rollout' if ROLLOUT else 'docs/screenshots/student-focus-prototype')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
GAP, LABEL, HEADER = 24, 92, 116
TARGET.mkdir(parents=True, exist_ok=True)


def compose(rows, title, subtitle, name):
    images = [[(Image.open(SOURCE / file).convert('RGB'), label)
               for file, label in row] for row in rows]
    width = max(sum(im.width for im, _ in row) + GAP * (len(row) + 1)
                for row in images)
    heights = [max(im.height for im, _ in row) + LABEL for row in images]
    board = Image.new('RGB', (width, HEADER + sum(heights) + GAP * (len(rows) + 1)), '#e9e8e0')
    draw = ImageDraw.Draw(board)
    draw.text((GAP, 24), title, font=ImageFont.truetype(FONT, 32), fill='#252c2a')
    draw.text((GAP, 72), subtitle, font=ImageFont.truetype(FONT, 18), fill='#535e59')
    y = HEADER + GAP
    for row, height in zip(images, heights):
        x = GAP
        for im, label in row:
            font = ImageFont.truetype(FONT, 21 if im.width < 500 else 25)
            lines, line = [], ''
            for word in label.split():
                candidate = f'{line} {word}'.strip()
                if draw.textlength(candidate, font=font) > im.width:
                    lines.append(line)
                    line = word
                else:
                    line = candidate
            lines.append(line)
            assert len(lines) <= 3, f'Caption too long: {label}'
            draw.multiline_text((x, y + 8), '\n'.join(lines), font=font, spacing=6, fill='#252c2a')
            board.paste(im, (x, y + LABEL))
            x += im.width + GAP
        y += height + GAP
    board.save(TARGET / name)
    print(name, board.size)


if ROLLOUT:
    compose([
        [('entry-desktop.png', '01 / Trước khi làm bài · Lịch thi và lượt đã dùng'),
         ('selected-desktop.png', '02 / Câu hỏi là trọng tâm · Một đáp án, trạng thái đã lưu')],
        [('multiple-desktop.png', '03 / Nhiều đáp án · Checkbox độc lập'),
         ('essay-desktop.png', '04 / Tự luận · Vùng viết và điều hướng')],
        [('navigation-1440.png', '05 / Mục lục 100 câu · Câu hiện tại luôn trong vùng cuộn'),
         ('confirmation-desktop.png', '06 / Nộp bài · Xác nhận, Hủy và keyboard focus')],
    ], 'FOCUS DESK / Student Exam / Full rollout / Desktop',
        '1440px · Ảnh Chromium 1:1 · Giữ direction đã duyệt',
        'review-board-desktop.png')
    compose([
        [('entry-mobile.png', '01 / Bắt đầu bài thi'),
         ('selected-mobile.png', '02 / Một đáp án · Đã lưu'),
         ('multiple-mobile.png', '03 / Nhiều đáp án'),
         ('navigation-390.png', '04 / Mục lục 60 câu · Cuộn tới câu hiện tại')],
        [('essay-mobile.png', '05 / Tự luận · Vùng viết'),
         ('rich-timer-390.png', '06 / Code cuộn riêng · Timer gọn khi cuộn'),
         ('save-error-mobile.png', '07 / Lỗi lưu · Có thể thử lại'),
         ('confirmation-mobile.png', '08 / Xác nhận nộp bài')],
    ], 'FOCUS DESK / Student Exam / Full rollout / Mobile',
        '390px · Ảnh Chromium 1:1 · Đã kiểm tra thêm 320 / 820 / 1024px',
        'review-board-mobile.png')
else:

    compose([
        [('entry-desktop.png', '01 / Trước khi làm bài · Thời lượng, lịch đóng, lịch sử lượt'),
         ('selected-desktop.png', '02 / Làm bài · Một đáp án, mục lục 30 câu, trạng thái lưu')],
        [('essay-desktop.png', '03 / Tự luận · Vùng viết, focus, câu đã trả lời'),
         ('confirmation-desktop.png', '04 / Nộp bài · Xác nhận riêng, có thể quay lại làm bài')],
    ], 'FOCUS DESK / Student Exam / Desktop',
        '1440px · Prototype để review direction · Ảnh Chromium 1:1, không device frame',
        'review-board-desktop.png')
    compose([
        [('entry-mobile.png', '01 / Bắt đầu bài thi'),
         ('selected-mobile.png', '02 / Một đáp án · Đã lưu'),
         ('multiple-mobile.png', '03 / Nhiều đáp án')],
        [('navigation-mobile.png', '04 / Mục lục 30 câu · Mở khi cần'),
         ('essay-mobile.png', '05 / Tự luận · Vùng viết & focus'),
         ('confirmation-mobile.png', '06 / Xác nhận nộp bài')],
    ], 'FOCUS DESK / Student Exam / Mobile',
        '390px · Mục lục đóng mặc định · Ảnh Chromium 1:1, không device frame',
        'review-board-mobile.png')
