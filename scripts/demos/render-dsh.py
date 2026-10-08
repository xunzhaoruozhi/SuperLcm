"""Generate DSH-specific explanatory GIFs, not benchmark or live UI recordings.
Requires Pillow and a Chinese-capable font. Optional: SUPERLCM_DEMO_FONT.
Only writes assets; does not read user conversations or touch DSH settings.
"""
from pathlib import Path
import os, glob, math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'images'
PREVIEW = ROOT / 'scratchpad' / 'animation-preview'
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
W, H = 1120, 650
FPS, SECONDS = 6, 18

def find_font():
    candidates = [os.environ.get('SUPERLCM_DEMO_FONT', '')]
    candidates += glob.glob('/System/Library/AssetsV2/com_apple_MobileAsset_Font*/**/PingFang.ttc', recursive=True)
    candidates += ['/System/Library/Fonts/STHeiti Medium.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
                   str(Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'msyh.ttc')]
    for p in candidates:
        if p and Path(p).is_file(): return p
    raise RuntimeError('Set SUPERLCM_DEMO_FONT to a Chinese-capable font file.')
FONT = find_font()
FONTS = {n: ImageFont.truetype(FONT, n) for n in [13, 15, 16, 18, 20, 22, 25, 30]}
THEMES = {
 'light': dict(bg='#ffffff', card='#fbfaf9', ink='#24211e', muted='#77716b', line='#e5dfd9', shelf='#eeebe7', accent='#c96442', soft='#f6e6de', green='#317953', green_soft='#e5f0e8'),
 'dark': dict(bg='#0d1117', card='#161b22', ink='#ece9e4', muted='#a49f98', line='#30363d', shelf='#21262d', accent='#e08a6b', soft='#362821', green='#83bc9a', green_soft='#1e3028')
}
WORDS = {
 'zh': {
  'badge':'DSH 独立版', 'segment':'20K 原文 → 摘要',
  'recall_title':'DSH 的对话一直继续，历史随时可查', 'recall_sub':'后台摘要与原文召回 · DSH 原生压缩继续工作',
  'take_title':'可选压缩接管：提前准备，就绪后一次替换', 'take_sub':'演示已开启接管 · 默认触发比例 80%，可自定义',
  'live':'正在使用的上下文', 'archive':'本机完整归档', 'draft':'后台准备区', 'originals':'完整原文',
  'raw_note':'每条记录都留在本机，编号保持不变', 'directory':'分层摘要目录', 'leafs':['环境与入口','模型与设置','验证与结果','后续决定'],
  'parent':'任务摘要 · 原文 #001–#024', 'ask':'当时定的部署端口是多少？', 'answer':'读取 #001 原文：使用 3080 端口。',
  'read':'lcm_find → lcm_outline → lcm_read', 'summary':'较旧内容的摘要', 'recent':'最近原文与新增内容保留',
  'ready':'固定范围准备就绪', 'waiting':'达到阈值，核对覆盖与工具边界', 'swap':'就绪后一次替换',
  'foot':'流程示意 · 摘要用于定位，重要细节以原文为准',
  'recall_steps':['对话原文持续归档','原文分块生成摘要','相邻摘要合并成上层目录','提问后沿目录查原文'],
  'take_steps':['继续对话，同时准备摘要','后台合并，当前上下文保持原文','达到所选比例，固定本轮范围','一次提交，最近原文继续保留'],
  'row1':'用户：部署端口使用 3080。', 'row2':'助手：沿用已有任务模型。', 'row3':'工具：配置已保存并核对。',
  'row4':'用户：先开启后台摘要。', 'row5':'助手：设置分块大小为 20K。', 'row6':'工具：原始记录持续归档。',
  'chunk':'源块', 'cap':'相对模型有效输入容量', 'still_raw':'原文仍在使用，草稿不会提前替换',
  'scope':'本轮固定范围', 'tail':'本轮之后新增的内容保持原文'
 },
 'en': {
  'badge':'DSH ONLY', 'segment':'20K source tokens → summary',
  'recall_title':'Keep working in DSH. Recall the exact history.', 'recall_sub':'Background summaries and source recall · DSH keeps native compaction',
  'take_title':'Optional takeover: prepare ahead, then commit once', 'take_sub':'Takeover enabled for this demo · Default trigger: 80%, adjustable',
  'live':'Active conversation context', 'archive':'Complete local archive', 'draft':'Background preparation', 'originals':'Original records',
  'raw_note':'Every original stays local with its record number', 'directory':'Layered summary outline', 'leafs':['Environment & entry','Models & settings','Checks & results','Later decisions'],
  'parent':'Task summary · source #001–#024', 'ask':'Which deployment port did we agree on?', 'answer':'Read original #001: use port 3080.',
  'read':'lcm_find → lcm_outline → lcm_read', 'summary':'Summaries of the older range', 'recent':'Recent originals and new content stay',
  'ready':'Fixed range is ready', 'waiting':'Threshold reached: validate sources and boundaries', 'swap':'One commit when ready',
  'foot':'Illustration · Summaries locate history; originals verify the facts',
  'recall_steps':['Archive originals as the conversation grows','Summarize complete source segments','Merge adjacent summaries into an outline','Follow the outline to the exact source'],
  'take_steps':['Keep working while summaries prepare','Merge in the background; originals stay active','Reach the chosen ratio and fix the range','Commit once; keep recent originals'],
  'row1':'User: use deployment port 3080.', 'row2':'Agent: keep the current task model.', 'row3':'Tool: settings saved and checked.',
  'row4':'User: enable background summaries first.', 'row5':'Agent: select 20K source chunks.', 'row6':'Tool: complete originals keep archiving.',
  'chunk':'Source block', 'cap':'Share of the model’s available input capacity', 'still_raw':'Originals stay active while drafts are prepared',
  'scope':'Fixed range for this commit', 'tail':'New content stays verbatim after the fixed cutoff'
 }
}

def text(draw, xy, value, size, color): draw.text(xy, value, font=FONTS[size], fill=color)
def rr(draw, box, fill, outline=None, radius=12, width=1): draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
def fit(value, width, size):
    while FONTS[size].getlength(value)>width: value=value[:-2]+'…' if not value.endswith('…') else value[:-2]+'…'
    return value

def brand(draw, c, w):
    for i, length in enumerate([30,21,12]): rr(draw,(30,24+i*8,30+length,29+i*8),c['accent'],radius=2)
    text(draw,(75,24),'SuperLcm for DSH',18,c['ink'])
    text(draw,(952,26),w['badge'],13,c['muted'])

def base(c, w, mode):
    im=Image.new('RGB',(W,H),c['bg']);d=ImageDraw.Draw(im)
    brand(d,c,w)
    text(d,(30,70),w[mode+'_title'],30,c['ink'])
    text(d,(32,116),w[mode+'_sub'],16,c['muted'])
    d.line((30,149,1090,149),fill=c['line'],width=1)
    rr(d,(30,172,548,554),c['card'],c['line']);rr(d,(572,172,1090,554),c['card'],c['line'])
    text(d,(51,190),w['live'],22,c['ink'])
    text(d,(594,190),w['archive' if mode=='recall' else 'draft'],22,c['ink'])
    text(d,(32,621),w['foot'],13,c['muted'])
    return im,d

def steps(d,c,w,mode,stage):
    labels=w[mode+'_steps'];text(d,(52,571),labels[stage],18,c['ink'])
    for i in range(4):
        x=974+i*27
        d.ellipse((x,582,x+10,592),fill=c['accent'] if i==stage else c['line'])

def original_rows(d,c,w,highlight=False):
    for i in range(6):
        y=245+i*43;active=highlight and i==0
        rr(d,(51,y,527,y+33),c['green_soft'] if active else c['shelf'],c['green'] if active else None,radius=7)
        text(d,(64,y+7),f'#{i+1:03d}',13,c['green'] if active else c['muted'])
        text(d,(121,y+5),fit(w['row'+str(i+1)],394,15),15,c['ink'])

def shelf(d,c,w,n=24,highlight=False):
    text(d,(594,235),w['originals'],16,c['muted'])
    for i in range(24):
        x=594+(i%12)*38;y=265+(i//12)*27
        col=c['green'] if highlight and i==0 else c['accent'] if i<n else c['shelf']
        rr(d,(x,y,x+29,y+19),col,radius=3)
    text(d,(594,324),w['raw_note'],13,c['muted'])

def recall(c,w,t):
    stage=min(3,int(t/4.5));im,d=base(c,w,'recall');original_rows(d,c,w,stage==3)
    shelf(d,c,w,min(24,int(6+t*4)),stage==3)
    text(d,(51,515),w['ask'] if stage==3 else w['still_raw'],15,c['accent'] if stage==3 else c['muted'])
    if stage==0:
        rr(d,(594,377,1068,458),c['shelf'],radius=9)
        text(d,(610,392),w['directory'],20,c['muted'])
        text(d,(610,424),w['segment'],15,c['muted'])
    elif stage==1:
        for i in range(min(4,1+int((t-4.5)/1.1))):
            y=364+i*40;rr(d,(594,y,1068,y+32),c['soft'],radius=7)
            text(d,(608,y+5),w['leafs'][i],16,c['ink']);text(d,(898,y+7),f'#{i*6+1:03d}–#{i*6+6:03d}',13,c['accent'])
    elif stage==2:
        rr(d,(594,363,1068,405),c['soft'],c['accent'],radius=7)
        text(d,(608,374),w['parent'],18,c['ink'])
        d.line((621,405,621,504),fill=c['line'],width=2)
        for i in range(4):
            y=417+i*28;d.line((621,y+9,644,y+9),fill=c['line'],width=2)
            text(d,(652,y),w['leafs'][i],15,c['muted'])
    else:
        rr(d,(594,368,1068,414),c['soft'],c['accent'],radius=8)
        text(d,(610,381),w['read'],18,c['ink'])
        rr(d,(594,431,1068,500),c['green_soft'],c['green'],radius=8)
        answer=w['answer'][:min(len(w['answer']),int((t-13.5)*25)+1)]
        text(d,(610,454),answer,18,c['ink'])
    steps(d,c,w,'recall',stage);return im

def context_blocks(d,c,w,swapped):
    if swapped:
        rr(d,(51,285,527,337),c['soft'],c['accent'],radius=8);text(d,(68,301),w['summary'],18,c['ink'])
        for i in range(4):
            y=351+i*35;rr(d,(51,y,527,y+27),c['green_soft'],radius=6)
            text(d,(68,y+4),fit(w['recent'] if i==0 else w['row'+str(i+3)],442,15),15,c['ink'])
    else:
        for i in range(16):
            x=51+(i%4)*122;y=288+(i//4)*47
            rr(d,(x,y,x+110,y+33),c['green_soft'] if i>=12 else c['shelf'],radius=5)
            text(d,(x+12,y+9),f'#{i+1:03d}',13,c['green'] if i>=12 else c['muted'])
    text(d,(51,511),w['tail' if swapped else 'still_raw'],15,c['muted'])

def takeover(c,w,t):
    stage=min(3,int(t/4.5));im,d=base(c,w,'take');swapped=stage==3
    ratio=(.70+t*.01 if stage==0 else .75+(t-4.5)*.007 if stage==1 else .8 if stage==2 else .31)
    text(d,(51,234),w['cap'],13,c['muted'])
    rr(d,(51,263,527,275),c['shelf'],radius=5)
    rr(d,(51,263,51+476*ratio,275),c['accent'] if not swapped else c['green'],radius=5)
    threshold=51+476*.8;d.line((threshold,259,threshold,280),fill=c['accent'],width=2)
    text(d,(threshold-14,234),'80%',13,c['accent'])
    context_blocks(d,c,w,swapped)
    if stage in (0,1):
        n=2 if stage==0 else 4
        for i in range(n):
            y=248+i*46;rr(d,(594,y,1068,y+35),c['soft'],radius=7)
            text(d,(610,y+7),w['leafs'][i]+' · 20K',16,c['ink'])
        if stage==1:
            rr(d,(594,443,1068,495),c['soft'],c['accent'],radius=8)
            text(d,(610,460),w['parent'],18,c['ink'])
    elif stage==2:
        rr(d,(594,249,1068,312),c['soft'],c['accent'],radius=8)
        text(d,(610,267),w['ready'],20,c['ink'])
        text(d,(594,342),w['scope'],16,c['muted'])
        for i in range(4):
            x=594+i*121;rr(d,(x,377,x+108,410),c['accent'],radius=5)
        text(d,(594,446),fit(w['waiting'],466,16),16,c['accent'])
    else:
        rr(d,(594,249,1068,312),c['green_soft'],c['green'],radius=8)
        text(d,(610,267),w['swap'],20,c['ink'])
        rr(d,(594,335,1068,403),c['soft'],c['accent'],radius=8)
        text(d,(610,357),w['summary'],18,c['ink'])
        text(d,(594,434),w['recent'],16,c['green'])
        text(d,(594,475),w['raw_note'],13,c['muted'])
    steps(d,c,w,'take',stage);return im

def render():
    for mode,draw in [('recall',recall),('compaction',takeover)]:
        for lang,w in WORDS.items():
            for theme,c in THEMES.items():
                frames=[draw(c,w,i/FPS) for i in range(FPS*SECONDS)]
                preview=PREVIEW / f'dsh-{mode}-{lang}-{theme}.png'
                frames[-1].save(preview)
                palette=frames[-1].quantize(colors=128)
                frames=[frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in frames]
                out=OUT / f'dsh-{mode}-{lang}-{theme}.gif'
                frames[0].save(out,save_all=True,append_images=frames[1:],loop=0,duration=1000//FPS,optimize=True,disposal=1)
                with Image.open(out) as gif:
                    assert gif.is_animated and gif.n_frames>4
                print(out.relative_to(ROOT), out.stat().st_size//1024, 'KB')
if __name__=='__main__': render()
