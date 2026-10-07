"""Compose final Folio boards from unaltered Playwright PNGs (Pillow required).
Run from repo root after the Exam inventory and Teacher sidebar UI tests.
All captures retain 1:1 pixel resolution. The mobile board's seventh panel is
explicitly a tablet comparison; the 390px navigation is intentionally not collapsed.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path('docs/screenshots/exam-folio-final')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
GAP, CAPTION, HEADER = 24, 110, 112
BG, INK = '#e4e2d9', '#252c2a'


def compose(rows, title, subtitle, filename):
    loaded = [[(Image.open(ROOT / name).convert('RGB'), label) for name, label in row] for row in rows]
    widths = [sum(im.width for im, _ in row) + GAP * (len(row) + 1) for row in loaded]
    heights = [max(im.height for im, _ in row) + CAPTION for row in loaded]
    board = Image.new('RGB', (max(widths), HEADER + sum(heights) + GAP * (len(rows) + 1)), BG)
    draw = ImageDraw.Draw(board)
    draw.text((GAP, 24), title, font=ImageFont.truetype(FONT, 34), fill=INK)
    draw.text((GAP, 72), subtitle, font=ImageFont.truetype(FONT, 20), fill=INK)
    y = HEADER + GAP
    for row, height in zip(loaded, heights):
        x = GAP
        for im, label in row:
            font = ImageFont.truetype(FONT, 20 if im.width < 500 else 26)
            words, lines, line = label.split(), [], ''
            for word in words:
                candidate = f'{line} {word}'.strip()
                if draw.textlength(candidate, font=font) > im.width:
                    lines.append(line)
                    line = word
                else:
                    line = candidate
            lines.append(line)
            draw.multiline_text((x, y + 10), '\n'.join(lines), font=font, fill=INK, spacing=8)
            board.paste(im, (x, y + CAPTION))
            x += im.width + GAP
        y += height + GAP
    board.save(ROOT / filename)
    print(filename, board.size)


compose([
    [('list-desktop.png', '01 / Danh sách · Nháp, công bố, lưu trữ'),
     ('identity-desktop.png', '02 / Mục 01 · Phần đầu đề thi'),
     ('schedule-desktop.png', '03 / Mục 02 · Lớp & mốc thời gian')],
    [('sidebar-collapsed-1440.png', '04 / Mục 03 · Thu menu, workspace 1360px'),
     ('settings-desktop.png', '05 / Mục 04 · Nhóm quy tắc'),
     ('review-desktop.png', '06 / Mục 05 · Phiếu rà soát & công bố')],
], 'EXAM FOLIO / Teacher Exam / Desktop',
    '1440px · Sáu màn đại diện · Ảnh Playwright 1:1 · Không device frame', 'review-board-desktop.png')
compose([[
    ('list-mobile.png', '01 / Danh sách'),
    ('identity-mobile.png', '02 / Thông tin'),
    ('schedule-mobile.png', '03 / Lớp & lịch'),
    ('pools-mobile.png', '04 / Câu hỏi & pool'),
    ('settings-mobile.png', '05 / Cài đặt'),
    ('review-mobile.png', '06 / Rà soát & công bố'),
    ('sidebar-collapsed-820.png', '07 / Đối chiếu tablet 820px · Thu menu · Workspace 772px'),
]], 'EXAM FOLIO / Teacher Exam / Mobile + tablet',
    'Sáu màn 390px + một đối chiếu 820px · Mobile giữ navigation ngang · Ảnh 1:1', 'review-board-mobile.png')
rows = []
for width in [1440, 820]:
    data = json.loads((ROOT / f'sidebar-geometry-{width}.json').read_text())
    rows.append([(f'sidebar-{state}-{width}.png',
                  f'{width}px / {label} · Main {int(data[key]["main"]["width"])}px · Workspace {int(data[key]["workspace"]["width"])}px')
                 for state, label, key in [('open', 'Mở menu', 'opened'), ('collapsed', 'Thu menu', 'collapsed')]])
compose(rows, 'EXAM FOLIO / Sidebar mở — đóng',
        'Cùng viewport, cùng nội dung · Main tăng 232px ở desktop, 184px ở tablet · Ảnh 1:1', 'sidebar-open-vs-collapsed.png')
