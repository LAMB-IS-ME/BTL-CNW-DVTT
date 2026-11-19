"""Compose unchanged pixels from actual BEFORE/AFTER Playwright screenshots.

Usage: python3 tests/ui/live-quiz-polish-boards.py [capture-root] [output-dir]
The before directory is a preserved copy of the final Full Rollout captures.
"""
from pathlib import Path
import hashlib
import json
import math
import sys
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'test-results/live-quiz-polish')
out = Path(sys.argv[2] if len(sys.argv) > 2 else 'docs/screenshots/live-quiz-polish')
out.mkdir(parents=True, exist_ok=True)
manifest = []

def font(size, bold=False):
    name = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
    return ImageFont.truetype(name, size)

def tile(state, width, label, phase='after', region=None, through=None, maxwidth=None, folder=None):
    path = root / phase / 'chromium' / (folder or str(width)) / f'{state}-surface.png'
    picture = Image.open(path).convert('RGB')
    original = picture.size
    crop = None
    if region or through:
        evidence = json.loads((root/phase/'chromium'/str(width)/'evidence.json').read_text())
        capture = next(c for c in evidence['captures'] if c['name'] == state)
        r = capture['regions'][region or through]
        assert r is not None
        crop = (max(0, math.floor(r['x'])), max(0, math.floor(r['y'])),
                min(picture.width, math.ceil(r['x']+r['width'])),
                min(picture.height, math.ceil(r['y']+r['height'])+2))
        if through:
            crop = (0, 0, picture.width, crop[3])
        picture = picture.crop(crop)
    if maxwidth and picture.width > maxwidth:
        picture = picture.resize((maxwidth, round(picture.height*maxwidth/picture.width)), Image.Resampling.LANCZOS)
    manifest.append({'source':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                     'label':label,'sourceSize':original,'crop':crop,'displaySize':picture.size})
    return label,picture

def board(name, title, subtitle, items, columns, cellwidth):
    margin,gap = 32,28
    rows = [items[i:i+columns] for i in range(0,len(items),columns)]
    heights = [max(im.height for _,im in row)+56 for row in rows]
    canvas = Image.new('RGB',(margin*2+columns*cellwidth+(columns-1)*gap,
                             132+sum(heights)+len(rows)*gap+margin),'#eeefe9')
    draw=ImageDraw.Draw(canvas)
    draw.text((margin,24),title,font=font(30,True),fill='#252c2a')
    draw.text((margin,75),subtitle,font=font(17),fill='#535e59')
    y=132
    for row,height in zip(rows,heights):
        for i,(label,picture) in enumerate(row):
            x=margin+i*(cellwidth+gap)
            draw.line((x,y,x+cellwidth,y),fill='#24574e',width=2)
            draw.text((x,y+12),label,font=font(18,True),fill='#252c2a')
            canvas.paste(picture,(x,y+52))
        y += height+gap
    canvas.save(out/name,optimize=True)

board('review-board-desktop.png','ExamSpace / Live Quiz · Targeted polish',
      '1440px · Real application captures · Approved composition retained',[
    tile('teacher-active',1440,'01 Teacher / Điều phối phiên'),
    tile('student-question',1440,'02 Student / Câu hỏi và đáp án'),
    tile('teacher-leaderboard',1440,'03 Teacher / Reveal và chuyển câu'),
    tile('student-finished',1440,'04 Student / Kết quả',through='.lq-ranking'),
],2,1136)

board('review-board-mobile.png','ExamSpace / Live Quiz · Mobile polish',
      '390px · Question, selection, receipt and ranking · Real app surfaces',[
    tile('student-question',390,'01 Câu hỏi'),
    tile('student-selected',390,'02 Đã chọn'),
    tile('student-submitted',390,'03 Đã nhận câu trả lời'),
    tile('teacher-leaderboard',390,'04 Teacher / Chuyển câu',through='.lq-control'),
    tile('student-leaderboard',390,'05 Xếp hạng sau câu',region='.lq-ranking'),
    tile('student-finished',390,'06 Kết quả cuối cùng',through='.lq-ranking'),
],3,358)

comparisons=[]
for state,label,region in [
    ('teacher-active','Teacher active',None),
    ('student-question','Student active','.lq-question'),
    ('student-submitted','Student submitted','.lq-question'),
    ('teacher-leaderboard','Teacher reveal',None),
    ('student-finished','Leaderboard','.lq-ranking'),
]:
    for phase in ['before','after']:
        comparisons.append(tile(state,1440,f'{phase.upper()} / {label}',phase=phase,region=region,maxwidth=1000))

def mobile_comparison(state,region,label):
    items=[tile(state,390,phase,phase=phase,region=region) for phase in ['before','after']]
    canvas=Image.new('RGB',(744,max(im.height for _,im in items)+32),'#eeefe9')
    draw=ImageDraw.Draw(canvas)
    for i,(phase,im) in enumerate(items):
        draw.text((i*386,0),phase.upper(),font=font(15,True),fill='#535e59')
        canvas.paste(im,(i*386,32))
    return label,canvas

comparisons += [mobile_comparison('student-question','.lq-question','Mobile question / BEFORE → AFTER'),
                mobile_comparison('student-finished','.lq-ranking','Mobile ranking / BEFORE → AFTER')]
board('visual-before-after.png','ExamSpace / Live Quiz · Full rollout → Targeted polish',
      'Same state, viewport and equivalent fixture · Actual pixels, no UI retouching',comparisons,2,1000)

board('evidence-states.png','ExamSpace / Live Quiz · Join state consistency',
      '390px · BEFORE: conflicting timeout copy / AFTER: pending, failed, then server-confirmed membership',[
    tile('join-timeout',390,'BEFORE / Timeout',phase='before',folder='hardening'),
    tile('join-pending',390,'AFTER / Pending',folder='hardening'),
    tile('join-timeout',390,'AFTER / Failed + retry',folder='hardening'),
    tile('join-recovered',390,'AFTER / Joined',folder='hardening'),
],4,358)

(out/'board-manifest.json').write_text(json.dumps({'captureRoot':'.',
    'pixelPolicy':'Crop and compose actual screenshots only. No UI retouching or fabricated states.',
    'items':manifest},ensure_ascii=False,indent=2)+'\n')
print('Created four polish boards and provenance manifest.')
