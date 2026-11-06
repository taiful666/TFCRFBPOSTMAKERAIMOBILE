# Draws the TF Media Studio logo (news page + play button, small TF badge, name inside). Run: python3 scripts/make-logo.py
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S=2048; K=S/1024
px=lambda v:int(v*K)
im=Image.new("RGBA",(S,S),(0,0,0,0))
g=Image.new("RGBA",(S,S)); gp=g.load()
for y in range(S):
    for x in range(S):
        t=(0.65*x+y)/(1.65*S); gp[x,y]=(int(12+8*t),int(24+105*t),int(66+95*t),255)
m=Image.new("L",(S,S),0)
ImageDraw.Draw(m).rounded_rectangle((px(24),px(24),px(1000),px(1000)),radius=px(215),fill=255)
im.paste(g,(0,0),m)
glow=Image.new("RGBA",(S,S),(0,0,0,0)); ImageDraw.Draw(glow).ellipse((px(200),px(150),px(830),px(680)),fill=(255,255,255,40))
im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(px(60))))
d=ImageDraw.Draw(im)
def rr(b,r,f): d.rounded_rectangle(tuple(px(v) for v in b),radius=px(r),fill=f)
rr((228,190,700,610),36,(190,215,235,255)); rr((196,160,668,580),36,(255,255,255,255))
rr((236,202,628,276),14,(14,36,84,255))
for i,w in enumerate((392,392,300,392)): rr((236,308+i*44,236+w,324+i*44),8,(160,178,210,255))
rr((236,496,420,556),12,(220,232,248,255))
d.polygon([(px(250),px(546)),(px(300),px(510)),(px(336),px(534)),(px(372),px(504)),(px(410),px(546))],fill=(31,182,166,255))
cx,cy,r=px(640),px(510),px(150)
d.ellipse((cx-r-px(14),cy-r-px(14),cx+r+px(14),cy+r+px(14)),fill=(14,36,84,255))
d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(245,189,60,255))
d.polygon([(cx-px(44),cy-px(78)),(cx-px(44),cy+px(78)),(cx+px(86),cy)],fill=(14,36,84,255))
bx,by,br=px(130),px(130),px(74)
d.ellipse((bx-br,by-br,bx+br,by+br),fill=(245,189,60,255))
fb=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",px(84))
tb=d.textbbox((0,0),"TF",font=fb); d.text((bx-(tb[0]+tb[2])/2,by-(tb[1]+tb[3])/2),"TF",font=fb,fill=(14,36,84,255))
name="MEDIA STUDIO"
fn=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",px(66))
sp=px(8); ws=[d.textlength(c,font=fn) for c in name]; tw=sum(ws)+sp*(len(name)-1)
d.rounded_rectangle((px(96),px(716),px(928),px(846)),radius=px(65),fill=(8,20,52,240))
x=(S-tw)/2
for c,w in zip(name,ws): d.text((x,px(742)),c,font=fn,fill=(255,255,255,255)); x+=w+sp
out=im.resize((1024,1024),Image.LANCZOS)
out.save("build/icon.png"); out.save("build/icon.ico",sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])
out.resize((256,256),Image.LANCZOS).save("src/logo.png")
