"""Compose review boards from Playwright screenshots; run from repository root.
Requires Pillow. Screens remain at 1:1 resolution; mobile source uses a labelled crop.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('docs/screenshots/exam-folio-prototype')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
INK = '#252c2a'
PAPER = '#e4e2d9'
SCREENS = ['list', 'editor-shell', 'questions', 'selected-pool']
LABELS = ['01 / Danh sách bài thi', '02 / Khung biên tập', '03 / Nguồn & câu đã chọn', '04 / Câu cố định & nhóm ngẫu nhiên']


def board(width, columns, output):
    images = [Image.open(ROOT / f'{name}-{width}.png').convert('RGB') for name in SCREENS]
    labels = LABELS.copy()
    if width == 390:
        # The full 3,950px source screenshot remains alongside this board.
        images[2] = images[2].crop((0, 620, width, 2575))
        labels[2] = '03 / Nguồn câu hỏi · trích vùng'
    gap, label_height, heading = 24, 76, 104
    rows = [images[i:i + columns] for i in range(0, len(images), columns)]
    heights = [max(im.height for im in row) + label_height for row in rows]
    result = Image.new('RGB', (columns * width + (columns + 1) * gap,
                              heading + sum(heights) + (len(rows) + 1) * gap), PAPER)
    draw = ImageDraw.Draw(result)
    draw.text((gap, 22), f'EXAM FOLIO / {width}px / Visual prototype', fill=INK,
              font=ImageFont.truetype(FONT, 32))
    draw.text((gap, 65), 'Ảnh Playwright ở tỷ lệ 1:1 · Thin slice: danh sách, shell, cấu trúc đề',
              fill=INK, font=ImageFont.truetype(FONT, 18))
    y = heading + gap
    for row_index, row in enumerate(rows):
        for col, im in enumerate(row):
            index = row_index * columns + col
            x = gap + col * (width + gap)
            label_font = ImageFont.truetype(FONT, 20 if width == 390 else 28)
            label = labels[index]
            if draw.textlength(label, font=label_font) > width:
                first, rest = label.split(' / ', 1)
                draw.text((x, y), first + ' /', fill=INK, font=label_font)
                draw.text((x, y + 30), rest, fill=INK, font=label_font)
            else:
                draw.text((x, y + 20), label, fill=INK, font=label_font)
            result.paste(im, (x, y + label_height))
        y += heights[row_index] + gap
    result.save(ROOT / output)
    print(output, result.size)


board(1440, 2, 'review-board-desktop.png')
board(390, 4, 'review-board-mobile.png')
