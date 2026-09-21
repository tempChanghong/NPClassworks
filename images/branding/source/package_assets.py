"""Package native Illustrator exports. Run after build-illustrator.jsx.
Only files below images/branding are written. Runtime copies use integration-map.json.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import io, json, struct, hashlib, math, xml.etree.ElementTree as ET
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
PNG=ROOT/'png'; PNG.mkdir(exist_ok=True)
R=ROOT/'source'/'renders'
SIZES=[16,24,32,48,64,256]
BG='#FFF7ED'
MASK_SCALE=.68
for v,sizes in [('standard',[1024,512,256,192,180]),('small',[16,24,32,48,64,256]),('mono',[16,24,32,48,64,256]),('mono-light',[16,24,32,48,64,256])]:
    for n in sizes:
        im=Image.open(R/f'{v}-{n}.png').convert('RGBA')
        assert im.size==((n*4,n*4) if n<=64 else (n,n)),(v,n,im.size)
        if n<=64:im=im.resize((n,n),Image.Resampling.LANCZOS)
        im.putdata([(0,0,0,0) if p[3]<=4 else p for p in im.get_flattened_data()])
        name=f'npclassworks-{n}.png' if v=='standard' or (v=='small' and n<=64) else f'npclassworks-{v}-{n}.png'
        im.save(PNG/name)

# Transparent foreground of maskable is rendered independently, so safe-zone tests
# inspect the actual silhouette rather than the already-opaque background.
base=Image.open(PNG/'npclassworks-1024.png').convert('RGBA')
def padded(size,scale,bg=None):
    k=round(size*scale)
    layer=Image.new('RGBA',(size,size),(0,0,0,0))
    mark=base.resize((k,k),Image.Resampling.LANCZOS)
    mark.putdata([(0,0,0,0) if p[3]<=4 else p for p in mark.get_flattened_data()])
    layer.alpha_composite(mark,((size-k)//2,(size-k)//2))
    if bg:
        out=Image.new('RGBA',(size,size),bg);out.alpha_composite(layer);return out.convert('RGB')
    return layer
for n in [192,512,1024]:padded(n,MASK_SCALE,BG).save(PNG/f'maskable-icon-{n}x{n}.png')
padded(180,.90,BG).save(PNG/'apple-touch-icon-180x180.png')
padded(512,.90,BG).save(PNG/'social-icon-512x512.png')
for n in [512,1024]:padded(n,MASK_SCALE).save(R/f'maskable-foreground-{n}.png')

svg=ET.parse(ROOT/'npclassworks-logo.svg').getroot()
paths='\n'.join(ET.tostring(p,encoding='unicode').replace('ns0:','').replace(':ns0','') for p in svg if p.tag.endswith('}path'))
cx,cy=629.5,613.5
(ROOT/'npclassworks-logo-maskable.svg').write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="169.5 153.5 920 920">
<title>NPClassworks maskable — opaque warm ivory background</title>
<rect x="169.5" y="153.5" width="920" height="920" fill="{BG}"/>
<g transform="translate({cx*(1-MASK_SCALE):.4f} {cy*(1-MASK_SCALE):.4f}) scale({MASK_SCALE})">{paths}</g></svg>\n''',encoding='utf-8')
mono=(ROOT/'npclassworks-logo-mono.svg').read_text(encoding='utf-8').replace('fill="currentColor"','fill="#000000"').replace('color="#202E35"','color="#000000"')
(ROOT/'safari-pinned-tab.svg').write_text(mono,encoding='utf-8')

chunks=[]
for n in SIZES:
    im=Image.open(PNG/f'npclassworks-{n}.png').convert('RGBA')
    if n==256:
        buf=io.BytesIO();im.save(buf,format='PNG');payload=buf.getvalue()
    else:
        xor=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes('raw','BGRA');stride=((n+31)//32)*4
        mask=bytearray(stride*n);a=im.getchannel('A')
        for y in range(n):
            for x in range(n):
                if a.getpixel((x,n-1-y))==0:mask[y*stride+x//8]|=1<<(7-x%8)
        payload=struct.pack('<IiiHHIIiiII',40,n,n*2,1,32,0,len(xor)+len(mask),0,0,0,0)+xor+bytes(mask)
    chunks.append((n,payload))
offset=6+16*len(chunks);entries=[]
for n,p in chunks:
    entries.append(struct.pack('<BBBBHHII',n%256,n%256,0,0,1,32,len(p),offset));offset+=len(p)
(ROOT/'npclassworks.ico').write_bytes(struct.pack('<HHH',0,1,len(chunks))+b''.join(entries)+b''.join(p for n,p in chunks))

ico=Image.open(ROOT/'npclassworks.ico');checks={}
assert ico.ico.sizes()=={(n,n) for n in SIZES}
for n in SIZES:
    expected=Image.open(PNG/f'npclassworks-{n}.png').convert('RGBA')
    assert ico.ico.getimage((n,n)).convert('RGBA').tobytes()==expected.tobytes()
    a=np.asarray(expected)[:,:,3]
    assert a.min()==0 and a.max()==255 and a[int(n*.8),int(n*.6)]==0
    checks[str(n)]={'variant':'small' if n<=64 else 'standard','exact_rgba_match':True}
safe={}
for n in [512,1024]:
    a=np.asarray(Image.open(R/f'maskable-foreground-{n}.png'))[:,:,3];ys,xs=np.where(a>0)
    radius=np.hypot(xs+.5-n/2,ys+.5-n/2)
    assert radius.max()<n*.4,(n,radius.max())
    out=Image.open(PNG/f'maskable-icon-{n}x{n}.png');assert out.mode=='RGB'
    safe[str(n)]={'max_foreground_radius_px':float(radius.max()),'allowed_radius_px':n*.4,'opaque':True}
geometry={}
for suffix in ['', '-small','-mono','-mono-light']:
    name=f'npclassworks-logo{suffix}.svg';tree=ET.parse(ROOT/name)
    pts=[p.attrib['d'] for p in tree.iter() if p.tag.endswith('}path')]
    original=ROOT.parents[2]/'NPEduTools'/'images'/'branding'/f'npedutools-logo{suffix}.svg'
    # Sibling repository is a reference only, never written.
    old=[p.attrib['d'] for p in ET.parse(original).iter() if p.tag.endswith('}path')]
    assert pts==old, name
    assert not any(e.tag.endswith('}image') for e in tree.iter())
    geometry[name]={'paths':len(pts),'same_geometry_as_npedutools':True,'embedded_images':0}
report={'ico':checks,'maskable':safe,'geometry':geometry,'colors':{'main':'#D97732','fold':'#A94E24','page':'#F2B56B','tile_background':BG}}
(ROOT/'source'/'validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

# Asset-copy manifest is deliberately separate from geometry generation.
mapping={
 'src/assets/logo.svg':'npclassworks-logo.svg',
 'src/assets/logo.png':'png/npclassworks-512.png',
 'src/assets/cslogo.png':'png/npclassworks-256.png',
 'src/assets/favicon.ico':'npclassworks.ico',
 'public/favicon.ico':'npclassworks.ico',
 'public/pwa/image/favicon.ico':'npclassworks.ico',
 'public/pwa/image/logo.svg':'npclassworks-logo.svg',
 'public/pwa/image/logo-small.svg':'npclassworks-logo-small.svg',
 'public/pwa/image/safari-pinned-tab.svg':'safari-pinned-tab.svg',
 'public/pwa/image/badge-64x64.png':'png/npclassworks-mono-light-64.png',
 'public/pwa/image/apple-touch-icon-180x180.png':'png/apple-touch-icon-180x180.png',
 'public/pwa/image/social-icon-512x512.png':'png/social-icon-512x512.png',
}
for n in [64,192,512]:mapping[f'public/pwa/image/pwa-{n}x{n}.png']=f'png/npclassworks-{n}.png'
for n in [512,1024]:mapping[f'public/pwa/image/maskable-icon-{n}x{n}.png']=f'png/maskable-icon-{n}x{n}.png'
(ROOT/'source'/'integration-map.json').write_text(json.dumps(mapping,indent=2),encoding='utf-8')

font=lambda n:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',n)
sheet=Image.new('RGB',(1440,1120),'#F6F8F7');d=ImageDraw.Draw(sheet)
def text(x,y,s,n=18,color='#202E35'):d.text((x,y),s,font=font(n),fill=color)
def paste(path,x,y,size=None):
    im=Image.open(path).convert('RGBA')
    if size:im=im.resize((size,size),Image.Resampling.LANCZOS)
    sheet.paste(im,(x,y),im)
text(48,30,'NPEP · 同一图形，两种课堂工具',34)
text(48,84,'NPEduTools 青绿  /  NPClassworks & KV 暖橙',19,'#607168')
green=ROOT.parents[2]/'NPEduTools'/'images'/'branding'/'png'/'npedutools-256.png'
for x,label in [(48,'NPEduTools'),(510,'NPClassworks / KV')]:
    d.rounded_rectangle((x,140,x+418,485),18,fill='#EDF2EF');text(x+24,158,label,22)
paste(green,129,214);paste(PNG/'npclassworks-256.png',591,214)
d.rounded_rectangle((972,140,1392,485),18,fill='#E7ECE9');text(996,158,'安装图标 · 安全留白',22)
mask=Image.open(PNG/'maskable-icon-512x512.png').resize((144,144),Image.Resampling.LANCZOS)
circle=Image.new('L',(144,144),0);ImageDraw.Draw(circle).ellipse((0,0,143,143),fill=255)
sheet.paste(mask,(1012,249),circle)
roundmask=Image.new('L',(144,144),0);ImageDraw.Draw(roundmask).rounded_rectangle((0,0,143,143),radius=31,fill=255)
sheet.paste(mask,(1210,249),roundmask)
text(1011,418,'圆形裁切',15);text(1205,418,'圆角裁切',15)
text(48,516,'简化版与单色版 · 实际像素',24)
for y,bg,fg,mono in [(568,'#FFFFFF','#202E35','mono'),(736,'#202E35','#FFFFFF','mono-light')]:
    d.rounded_rectangle((48,y,1392,y+140),16,fill=bg)
    text(72,y+14,'暖橙',15,fg);text(764,y+14,'单色',15,fg)
    for j,n in enumerate([16,24,32,48,64]):
        x=175+j*106;paste(PNG/f'npclassworks-{n}.png',x+(64-n)//2,y+40+(64-n)//2);text(x+15,y+111,str(n),13,fg)
        x=850+j*100;paste(PNG/f'npclassworks-{mono}-{n}.png',x+(64-n)//2,y+40+(64-n)//2);text(x+15,y+111,str(n),13,fg)
for j,(c,label) in enumerate([('#D97732','主色'),('#A94E24','深折面'),('#F2B56B','浅书页'),(BG,'安装图标底色')]):
    x=48+j*348;d.rounded_rectangle((x,924,x+40,964),8,fill=c,outline='#CAD3CD');text(x+52,924,c,18);text(x+52,953,label,14,'#607168')
text(48,1010,'普通标志透明；Apple touch 与 maskable 单独使用不透明底色。小图请以 100% 查看。',17,'#607168')
text(48,1051,'沿用原始贝塞尔几何；参考 PNG 的杂色与碎点未进入矢量或导出文件。',17,'#607168')
sheet.save(ROOT/'npep-family-preview.png')
print(json.dumps(report,indent=2))
