import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import qrcode
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

OUT = Path('release')
OUT.mkdir(exist_ok=True)
ASSETS = OUT / 'assets'
ASSETS.mkdir(exist_ok=True)
PUBLIC_URL = os.environ.get('PUBLIC_URL', 'http://localhost:4173').strip()

# premium background (radial, no hard-edged decorative blocks)
def make_bg(path):
    import math
    w, h = 1600, 900
    base = Image.new('RGB', (w, h), (5, 22, 31))
    px = base.load()
    for yy in range(h):
        for xx in range(w):
            nx, ny = xx / w, yy / h
            r1 = math.exp(-(((nx - .86) ** 2) / (2 * .30 ** 2) + ((ny - .03) ** 2) / (2 * .38 ** 2)))
            r2 = math.exp(-(((nx - .02) ** 2) / (2 * .28 ** 2) + ((ny - .98) ** 2) / (2 * .32 ** 2)))
            r = 5 + int(10 * r1) + int(7 * r2)
            g = 22 + int(48 * r1) + int(20 * r2)
            b = 31 + int(42 * r1) + int(3 * r2)
            px[xx, yy] = (min(r, 255), min(g, 255), min(b, 255))
    base.save(path)

bg_path = OUT / 'assets' / 'pitch-bg.png'
make_bg(bg_path)
IS_LOCAL = PUBLIC_URL.startswith('http://localhost') or PUBLIC_URL.startswith('http://127.')

# ---------- palette ----------
BG = RGBColor(0x05, 0x16, 0x1F)
BG2 = RGBColor(0x08, 0x2A, 0x31)
INK = RGBColor(0xEF, 0xFB, 0xF7)
MUTED = RGBColor(0x9D, 0xC4, 0xBB)
MINT = RGBColor(0x6F, 0xF0, 0xD3)
TEAL = RGBColor(0x1B, 0x65, 0x58)
GOLD = RGBColor(0xFF, 0xD1, 0x66)
GOLD2 = RGBColor(0xF0, 0xA6, 0x3A)
CARD = RGBColor(0x0B, 0x2B, 0x31)
CARD2 = RGBColor(0x0E, 0x3A, 0x3A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def rect(s, x, y, w, h, fill, line=None, radius=False, transparency=0):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shp = s.shapes.add_shape(shape_type, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    if transparency:
        shp.fill.transparency = transparency
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line; shp.line.width = Pt(1)
    if radius:
        try: shp.adjustments[0] = 0.08
        except Exception: pass
    shp.shadow.inherit = False
    return shp


def text(s, x, y, w, h, runs, size=16, color=INK, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=1.0, font='Arial', margin=0.02):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(margin)
    tf.margin_top = tf.margin_bottom = Inches(margin)
    if isinstance(runs, str):
        runs = [(runs, {})]
    for i, (txt, opts) in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = opts.get('align', align)
        p.line_spacing = opts.get('spacing', spacing)
        p.space_after = Pt(opts.get('space_after', 0))
        r = p.add_run(); r.text = txt
        r.font.name = opts.get('font', font)
        r.font.size = Pt(opts.get('size', size))
        r.font.bold = opts.get('bold', bold)
        r.font.color.rgb = opts.get('color', color)
    return tb


def bg(s, variant=0):
    s.shapes.add_picture(str(bg_path), Inches(0), Inches(0), width=Inches(13.333), height=Inches(7.5))
    rect(s, 0, 0, 13.333, 0.07, MINT if variant == 0 else GOLD)


def header(s, kicker, title, page, sub=None):
    text(s, 0.6, 0.36, 8.0, 0.3, kicker.upper(), size=10.5, color=MINT, bold=True, spacing=1.0)
    text(s, 0.6, 0.64, 12.1, 0.7, title, size=27, color=INK, bold=True, spacing=0.95)
    if sub:
        text(s, 0.6, 1.30, 11.8, 0.4, sub, size=12.5, color=MUTED, spacing=1.05)
    text(s, 12.15, 0.38, 0.65, 0.3, f'{page}/5', size=10, color=MUTED, align=PP_ALIGN.RIGHT)


def footer(s):
    rect(s, 0.6, 7.06, 12.13, 0.012, RGBColor(0x1A, 0x3C, 0x3B))
    text(s, 0.6, 7.12, 9.2, 0.24,
         'Bloc-Cu-Bloc · TEAMCODE · prototip de concurs · date demonstrative · fără plăți reale',
         size=8.5, color=MUTED)
    text(s, 10.4, 7.12, 2.3, 0.24, 'Ilustrație artistică; detaliile pot evolua', size=7.5,
         color=MUTED, align=PP_ALIGN.RIGHT)


def pill(s, x, y, w, label, fill=CARD2, color=MINT, size=9.5):
    rect(s, x, y, w, 0.32, fill, line=RGBColor(0x25, 0x5A, 0x55), radius=True)
    text(s, x, y + 0.055, w, 0.22, label, size=size, color=color, bold=True, align=PP_ALIGN.CENTER)


def rounded_image(src, dst, size):
    im = Image.open(src).convert('RGB')
    im = ImageOps.fit(im, size, Image.LANCZOS)
    mask = Image.new('L', size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0], size[1]], radius=int(min(size) * 0.055), fill=255)
    im = im.convert('RGBA'); im.putalpha(mask)
    im.save(dst)


# QR
qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=3)
qr.add_data(PUBLIC_URL); qr.make(fit=True)
qr_img = qr.make_image(fill_color='#071c2a', back_color='white').convert('RGB')
qr_img.save(OUT / 'QR_TEAMCODE.png')

# images
outside = ASSETS / 'ppt-outside.png'
inside = ASSETS / 'ppt-inside.png'
mobile = ASSETS / 'ppt-mobile.png'
rounded_image('deliverables/assets/desktop-outside.png', outside, (1800, 1050))
rounded_image('deliverables/assets/desktop-inside.png', inside, (1200, 760))
rounded_image('deliverables/assets/mobile-contribution.png', mobile, (520, 1050))

# ============ SLIDE 1 ============
s = prs.slides.add_slide(BLANK); bg(s, 0)
text(s, 0.6, 0.34, 6.0, 0.28, 'BLOC-CU-BLOC  ·  TEAMCODE  ·  START YOUR STARTUP 2026', size=10, color=MINT, bold=True)
text(s, 0.6, 0.78, 12.1, 1.55,
     [('Un campus nu se construiește\ndoar cu bani. Se construiește cu oameni.', {})],
     size=38, color=INK, bold=True, spacing=0.93)
text(s, 0.6, 2.38, 7.4, 0.82,
     'Bloc-Cu-Bloc transformă campania Fundației HIPOLITECH într-o lume 3D jucabilă: comunitatea construiește în miniatură, companiile descoperă o implicare credibilă, iar donația reală rămâne separat, pe pagina oficială.',
     size=13.2, color=MUTED, spacing=1.12)

# problem card
rect(s, 0.6, 3.45, 6.2, 2.55, CARD, line=RGBColor(0x1C, 0x46, 0x45), radius=True)
text(s, 0.9, 3.68, 5.6, 0.3, 'PROBLEMA', size=10, color=GOLD, bold=True)
text(s, 0.9, 4.02, 5.7, 1.85,
     [('Atenția nu se cumpără. Încrederea nici atât.', {'size': 17, 'bold': True, 'color': INK, 'space_after': 7}),
      ('• 100.000.000 lei proiect total; 1.250.000 lei prima etapă — estimare publicată de Fundație.', {'size': 10.8, 'color': MUTED, 'space_after': 4}),
      ('• O donație uitată rapid; o construcție vizibilă rămâne în memorie.', {'size': 10.8, 'color': MUTED, 'space_after': 4}),
      ('• Companiile vor vizibilitate, nu promisiuni inventate.', {'size': 10.8, 'color': MUTED})],
     spacing=1.02)

# audience
rect(s, 7.0, 3.45, 5.73, 1.18, CARD2, line=RGBColor(0x2A, 0x64, 0x5C), radius=True)
text(s, 7.25, 3.62, 5.3, 0.3, 'ALUMNI & COMUNITATE', size=9.5, color=MINT, bold=True)
text(s, 7.25, 3.93, 5.25, 0.58, 'Revino în campus, construiește vizibil, invită un prieten. Contribuția din aplicație este simulată.', size=10.5, color=INK, spacing=1.02)
rect(s, 7.0, 4.75, 5.73, 1.18, CARD2, line=RGBColor(0x2A, 0x64, 0x5C), radius=True)
text(s, 7.25, 4.92, 5.3, 0.3, 'COMPANII', size=9.5, color=GOLD, bold=True)
text(s, 7.25, 5.23, 5.25, 0.58, 'Vizibilitate autentică în lumea 3D și un motiv clar de discuție. Fără parteneriate pretins reale.', size=10.5, color=INK, spacing=1.02)

# hypotheses strip
rect(s, 0.6, 6.12, 12.13, 0.72, RGBColor(0x10, 0x30, 0x30), line=RGBColor(0x2A, 0x5E, 0x56), radius=True)
text(s, 0.85, 6.25, 2.2, 0.2, 'IPOTEZĂ DE CONCURS', size=8.5, color=GOLD, bold=True)
text(s, 0.85, 6.46, 2.6, 0.25, '250.000 lei brut', size=13, color=INK, bold=True)
text(s, 3.65, 6.25, 2.2, 0.2, 'BUGET MAXIM', size=8.5, color=GOLD, bold=True)
text(s, 3.65, 6.46, 2.3, 0.25, '15.000 lei', size=13, color=INK, bold=True)
text(s, 6.0, 6.25, 2.2, 0.2, 'DURATĂ', size=8.5, color=GOLD, bold=True)
text(s, 6.0, 6.46, 2.0, 0.25, '6 luni', size=13, color=INK, bold=True)
text(s, 8.2, 6.25, 4.3, 0.5, 'Nu sunt ținte ale Fundației. Cifrele oficiale sunt citate separat, cu atribuire.', size=8.6, color=MUTED, spacing=1.05)
footer(s)

# ============ SLIDE 2 ============
s = prs.slides.add_slide(BLANK); bg(s, 0)
header(s, 'PRODUSUL', 'Un teren de joacă pentru o campanie serioasă', 2,
       'Mobil-first, 3D cu fallback 2D, fără backend și fără AI la runtime. Toate contribuțiile sunt simulate.')
s.shapes.add_picture(str(outside), Inches(0.6), Inches(1.86), width=Inches(7.1))
s.shapes.add_picture(str(inside), Inches(8.2), Inches(1.92), width=Inches(3.15))
s.shapes.add_picture(str(mobile), Inches(11.55), Inches(1.92), height=Inches(3.18))

# mechanic chips
chips = [('1 formă gratuită', 'apoi niveluri'), ('Provocare + cooldown 30s', 'max. 3/oră'), ('Matching demo', 'promisiune, nu fond')]
x = 0.6
for i, (a, b) in enumerate(chips):
    rect(s, x, 6.04, 2.35, 0.58, CARD, line=RGBColor(0x25, 0x5A, 0x55), radius=True)
    text(s, x+0.12, 6.11, 2.12, 0.22, a, size=9.6, color=INK, bold=True)
    text(s, x+0.12, 6.34, 2.12, 0.2, b, size=8.1, color=MUTED)
    x += 2.47

# QR block
if (OUT / 'QR_TEAMCODE.png').exists():
    rect(s, 8.2, 5.18, 4.53, 1.62, CARD2, line=RGBColor(0x2A, 0x64, 0x5C), radius=True)
    s.shapes.add_picture(str(OUT / 'QR_TEAMCODE.png'), Inches(8.35), Inches(5.30), height=Inches(1.35))
    label = 'DEMO LOCAL' if IS_LOCAL else 'PROTOTIP LIVE'
    text(s, 9.88, 5.40, 2.7, 0.2, f'SCANEAZĂ · {label}', size=8.2, color=GOLD, bold=True)
    text(s, 9.88, 5.66, 2.7, 0.55, PUBLIC_URL.replace('https://','').replace('http://',''), size=8, color=INK, spacing=1.0)
    text(s, 9.88, 6.25, 2.7, 0.4, 'Prototip de concurs. Date demo. Fără plăți reale.', size=7.2, color=MUTED, spacing=1.02)

text(s, 0.6, 6.72, 7.2, 0.24,
     'Ilustrație artistică; detaliile pot evolua. Fără promisiuni despre clădirea reală.',
     size=8.2, color=MUTED, spacing=1.0)
footer(s)

# ============ SLIDE 3 ============
s = prs.slides.add_slide(BLANK); bg(s, 1)
header(s, 'MODEL FINANCIAR', '250.000 lei brut → 235.000 lei net. Restul, costuri.', 3,
       'Scenariu de lucru, nu rezultat garantat. Bugetul este plafonat la 15.000 lei, fiecare cost o singură dată.')

stats = [('BRUT', '250.000 lei', '500 × 100 + 20 × 10.000', MINT),
         ('COSTURI', '15.000 lei', 'buget maxim, 9 linii', GOLD),
         ('NET', '235.000 lei', 'înainte de colectare', WHITE),
         ('ESTIMAT PRIMIT', '205.000 lei', '90% persoane · 80% companii', INK)]
x = 0.6
for i, (lab, val, sub, col) in enumerate(stats):
    rect(s, x, 1.72, 2.92, 1.12, CARD, line=RGBColor(0x22, 0x50, 0x4A), radius=True)
    text(s, x+0.18, 1.85, 2.6, 0.2, lab, size=8.4, color=GOLD, bold=True)
    text(s, x+0.18, 2.07, 2.6, 0.4, val, size=20, color=col, bold=True)
    text(s, x+0.18, 2.50, 2.6, 0.22, sub, size=7.8, color=MUTED)
    x += 3.08

# funnel
rect(s, 0.6, 3.05, 6.15, 3.02, CARD, line=RGBColor(0x22, 0x50, 0x4A), radius=True)
text(s, 0.85, 3.22, 5.6, 0.25, 'FUNNEL NECESAR', size=9.2, color=MINT, bold=True)
text(s, 0.85, 3.52, 5.7, 0.25, '12.500 contacte eligibile', size=15, color=INK, bold=True)
text(s, 0.85, 3.80, 5.7, 0.22, '× 4% conversie = 500 donatori individuali', size=9.8, color=MUTED)
text(s, 0.85, 4.18, 5.7, 0.25, '400 companii eligibile', size=15, color=INK, bold=True)
text(s, 0.85, 4.46, 5.7, 0.22, '× 5% conversie = 20 sponsori', size=9.8, color=MUTED)
text(s, 0.85, 4.90, 5.65, 0.88,
     'Bază caldă, nu liste cumpărate. Conversia este credibilă doar cu alumni, campus și intro-uri. Cost per donator: 15 lei pe cheltuieli relevante; 30 lei pe buget total.',
     size=8.8, color=MUTED, spacing=1.08)

# scenarios bars
rect(s, 7.0, 3.05, 5.73, 3.02, CARD, line=RGBColor(0x22, 0x50, 0x4A), radius=True)
text(s, 7.25, 3.22, 5.2, 0.25, 'SCENARII · BRUT / NET', size=9.2, color=GOLD, bold=True)
rows = [('Bază', 250, 235), ('A · contribuție −30%', 235, 220), ('B · sponsori −50%', 150, 135)]
y = 3.62
for label, gross, net in rows:
    text(s, 7.25, y, 1.85, 0.22, label, size=8.8, color=INK, bold=True)
    # gross bar
    rect(s, 9.10, y+0.01, 2.85 * gross / 250, 0.14, RGBColor(0x1E, 0x55, 0x4E), radius=True)
    # net bar
    rect(s, 9.10, y+0.18, 2.85 * net / 250, 0.14, GOLD if net != 235 else MINT, radius=True)
    text(s, 12.02, y-0.01, 0.55, 0.2, str(gross), size=7.2, color=MUTED)
    text(s, 12.02, y+0.17, 0.55, 0.2, str(net), size=7.2, color=MUTED)
    y += 0.62
text(s, 7.25, 5.52, 5.2, 0.42,
     'Pledged ≠ received. 45.000 lei este gap de colectare, nu bani pierduți. Matching-ul din prototip este promisiune demo, afișată separat.',
     size=8.0, color=MUTED, spacing=1.08)

text(s, 0.6, 6.25, 12.1, 0.55,
     'Cifre oficiale: 100.000.000 lei total; 1.250.000 lei prima etapă — estimare publicată de Fundație. Modelul este o ipoteză de concurs, nu un buget aprobat.',
     size=8.7, color=MUTED, spacing=1.05)
footer(s)

# ============ SLIDE 4 ============
s = prs.slides.add_slide(BLANK); bg(s, 0)
header(s, 'PLAN', '6 luni: validează, scalează, consolidează', 4,
       'Echipă de 2–3 studenți. Buget total 15.000 lei. Decizie la fiecare prag, nu la final.')

phases = [
    ('01', 'VALIDEAZĂ', 'Luna 1', ['Prototip + landing + QR', 'Test A/B pe 2 mesaje: 2.500 lei', '40 companii țintite, intro-uri', 'Raport: CTA, cereri demo, cost/donator'], MINT),
    ('02', 'SCALEAZĂ', 'Lunile 2–3', ['Social pe mesajul câștigător', 'Campus QR + comunități alumni', 'Creatori demo, colaborare dezvăluită', 'Optimizare săptămânală a costului'], GOLD),
    ('03', 'CONSOLIDEAZĂ', 'Lunile 4–6', ['Outreach sponsorizări, pachete clare', 'Matching demonstrativ, fără promisiuni false', 'Raport de impact către comunitate', 'Închidere cu sume confirmate de Fundație'], RGBColor(0xB8, 0xE8, 0xDE)),
]
x = 0.6
for num, name, when, bullets, col in phases:
    rect(s, x, 1.72, 3.92, 3.82, CARD, line=RGBColor(0x22, 0x50, 0x4A), radius=True)
    text(s, x+0.24, 1.92, 0.7, 0.4, num, size=20, color=col, bold=True)
    text(s, x+0.24, 2.34, 3.3, 0.3, name, size=15.5, color=INK, bold=True)
    text(s, x+0.24, 2.64, 3.3, 0.22, when, size=9, color=GOLD, bold=True)
    yy = 3.02
    for b in bullets:
        rect(s, x+0.25, yy+0.10, 0.07, 0.07, col, radius=True)
        text(s, x+0.42, yy, 3.1, 0.5, b, size=9.1, color=MUTED, spacing=1.03)
        yy += 0.56
    x += 4.10

# KPI strip
rect(s, 0.6, 5.78, 12.13, 0.92, CARD2, line=RGBColor(0x2A, 0x5E, 0x56), radius=True)
kpis = [('≥ 1,5%', 'click pe CTA real'), ('≥ 3%', 'cereri demo relevante'), ('≤ 25 lei', 'cost/donator relevant'), ('≥ 5', 'discuții de sponsorizare')]
x = 0.85
for big, small in kpis:
    text(s, x, 5.92, 2.0, 0.3, big, size=17, color=GOLD, bold=True)
    text(s, x, 6.27, 2.55, 0.25, small, size=8.8, color=MUTED)
    x += 2.95
text(s, 0.6, 6.82, 12.1, 0.22, 'Dacă un prag nu este atins, schimbăm mesajul, canalul sau oferta — nu raportăm success fictiv.', size=8.5, color=INK)
footer(s)

# ============ SLIDE 5 ============
s = prs.slides.add_slide(BLANK); bg(s, 1)
header(s, 'TEST & ÎNVĂȚARE', 'Primul test: 4 săptămâni, praguri clare, decizie onestă', 5,
       'Nu așteptăm 6 luni ca să aflăm dacă mesajul funcționează. Măsurăm ce putem verifica.')

weeks = [
    ('S1', 'Construiește', 'Landing + prototip + QR. Două mesaje A/B: „revino în campus” vs. „construiește vizibil”. Buget test 2.500 lei.'),
    ('S2', 'Distribuie', '3 postări social + 2 întâlniri alumni. Măsurăm click-ul pe CTA real, nu doar timpul în joc.'),
    ('S3', 'Vorbește', '40 companii prin intro/contact direct. Cerem o discuție, nu o promisiune de sponsorizare.'),
    ('S4', 'Decide', 'Raport: vizitatori, CTA, cereri, donații confirmate de Fundație, cost/donator. Scalez / schimb / opresc.'),
]
x = 0.6
for tag, name, body in weeks:
    rect(s, x, 1.72, 2.92, 2.42, CARD, line=RGBColor(0x22, 0x50, 0x4A), radius=True)
    text(s, x+0.2, 1.88, 0.6, 0.3, tag, size=11, color=GOLD, bold=True)
    text(s, x+0.2, 2.18, 2.55, 0.28, name, size=13.5, color=INK, bold=True)
    text(s, x+0.2, 2.52, 2.55, 1.45, body, size=8.8, color=MUTED, spacing=1.09)
    x += 3.08

# if low table
rect(s, 0.6, 4.38, 7.25, 2.28, CARD2, line=RGBColor(0x2A, 0x5E, 0x56), radius=True)
text(s, 0.85, 4.54, 6.8, 0.25, 'DACĂ REZULTATELE SUNT MICI', size=9.2, color=GOLD, bold=True)
rows = [
    ('Sub 1,5% click CTA', 'Rescriu promisiunea și CTA-ul; nu acuz audiența.'),
    ('Trafic mare, donații puține', 'Verific încrederea, claritatea linkului oficial, frica de plată.'),
    ('Companii fără răspuns', 'Reduc pachetele, cer intro-uri, schimb unghiul pe employer branding.'),
    ('Cost/donator mare', 'Mut bugetul din social în alumni, campus și email cu consimțământ.'),
]
y = 4.88
for a, b in rows:
    text(s, 0.85, y, 2.35, 0.32, a, size=8.8, color=INK, bold=True)
    text(s, 3.25, y, 4.35, 0.36, b, size=8.4, color=MUTED, spacing=1.02)
    y += 0.41

# right compliance
rect(s, 8.05, 4.38, 4.68, 2.28, RGBColor(0x2A, 0x22, 0x08), line=RGBColor(0x6A, 0x53, 0x1C), radius=True)
text(s, 8.28, 4.54, 4.2, 0.25, 'LINII ROȘII', size=9.2, color=GOLD, bold=True)
text(s, 8.28, 4.86, 4.2, 1.62,
     [('• Separăm simulat / real și promis / primit.', {'size': 8.6, 'color': INK, 'space_after': 4}),
      ('• Fără card, IBAN, CNP, chitanțe sau logo-uri de plăți.', {'size': 8.6, 'color': INK, 'space_after': 4}),
      ('• Fără promisiuni de cazare, avantaje sau scutiri fiscale.', {'size': 8.6, 'color': INK, 'space_after': 4}),
      ('• Nu inventăm sponsori, beneficiari sau testimoniale.', {'size': 8.6, 'color': INK})],
     spacing=1.03)

text(s, 0.6, 6.82, 12.1, 0.2,
     'Sursă oficială: fundatia.upb.ro/proiecte-si-evenimente/un-loc-in-camin-poate-schimba-un-destin/ · cifrele oficiale sunt estimări publicate de Fundație.',
     size=7.8, color=MUTED)
footer(s)

prs.save(OUT / 'Pitch_TEAMCODE.pptx')
print('saved', OUT / 'Pitch_TEAMCODE.pptx', 'slides:', len(prs.slides), 'url:', PUBLIC_URL)
