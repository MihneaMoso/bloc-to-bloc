from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from pathlib import Path
import os

OUT_DIR = Path(os.environ.get('OUT_DIR', 'deliverables'))
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / 'Jurnal_AI_TEAMCODE.docx'
doc = Document()
section = doc.sections[0]
section.page_width = Cm(21)
section.page_height = Cm(29.7)
section.top_margin = Cm(1.15)
section.bottom_margin = Cm(1.0)
section.left_margin = Cm(1.5)
section.right_margin = Cm(1.5)

styles = doc.styles
normal = styles['Normal']
normal.font.name = 'Arial'
normal.font.size = Pt(7.8)
normal.paragraph_format.space_after = Pt(2)
normal.paragraph_format.line_spacing = 1.0
normal._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')

def shade(paragraph, fill):
    pPr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), fill)
    pPr.append(shd)

def title(text, sub):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(text)
    r.bold = True; r.font.size = Pt(15); r.font.color.rgb = RGBColor(0x07, 0x1C, 0x2A)
    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(5)
    r2 = p2.add_run(sub)
    r2.font.size = Pt(7.2); r2.font.color.rgb = RGBColor(0x4E, 0x6B, 0x66)

def heading(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(5)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text)
    r.bold = True; r.font.size = Pt(9.2); r.font.color.rgb = RGBColor(0x0E, 0x3A, 0x3A)
    shade(p, 'E3F7F0')

def para(text, bold_prefix=None, size=7.8):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    if bold_prefix:
        r = p.add_run(bold_prefix); r.bold = True; r.font.size = Pt(size)
    r2 = p.add_run(text); r2.font.size = Pt(size)
    return p

def bullet(text, bold_prefix=None):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.left_indent = Cm(0.45)
    p.paragraph_format.first_line_indent = Cm(-0.25)
    if bold_prefix:
        r = p.add_run(bold_prefix); r.bold = True; r.font.size = Pt(7.6)
    r2 = p.add_run(text); r2.font.size = Pt(7.6)

title('Jurnal de utilizare a AI — Bloc-Cu-Bloc (TEAMCODE)',
      'AI-Powered Business Challenge · Start Your Startup 2026 · Secțiunea Studenți · Fundația HIPOLITECH · prototip de concurs cu date demonstrative')

heading('1. Cum a fost folosit AI-ul')
para('AI-ul a fost folosit ca asistent de construcție și redactare: schelet Vite/TypeScript/Three.js, componente UI, text de conformitate, model financiar și materiale. Codul a fost rulat, testat și corectat local. Prototipul final NU depinde de AI la runtime: toate regulile, scorurile, contribuțiile simulate și generarea de mesaje pentru ambasadori sunt deterministe, pe bază de config și șabloane.')

heading('2. Prompts reale și decizii')
bullet('„Construiește un prototip Vite + TypeScript strict + Three.js vanilla, cu lume 3D, clădire cu 4 etaje, plasare pe grid și fallback 2D. Fără React Three Fiber.” Rezultat util: arhitectură Store + World + UI, InstancedMesh pe tip de formă și geometrie statică unită. Decizie: Three.js vanilla și instancing, pentru buget redus pe telefon; am respins R3F și umbrele în timp real.', 'Prompt 1 — arhitectură: ')
bullet('„Scrie fluxul de contribuție simulată cu banner persistent «SIMULARE DEMONSTRATIVĂ», chips 10/25/50/100/250, input 5–10.000, fără câmpuri de card și fără chitanță.” Rezultat util: structură de modal în doi pași și text de conformitate. Decizie: am păstrat bannerul pe ambele ecrane, butonul „Confirmă simularea” și linkul real separat, în tab nou, rel=noopener.', 'Prompt 2 — flux simulat: ')
bullet('„Generează un model financiar cu Ipoteze, Calcule, Buget ≤15.000, Funnel, Scenarii, Pledged vs Received și Verificări, cu formule reale.” Rezultat util: schelet de foi și formule. Decizie: buget exact 15.000 lei, scenariul de bază 500×100 + 20×10.000 = 250.000 brut / 235.000 net; am adăugat rate de încasare și verificări automate, apoi am recalculat fișierul cu LibreOffice.', 'Prompt 3 — finanțe: ')

heading('3. Erori / afirmații neverificate și corecții')
bullet('AI a formulat o variantă de tipul „10.000 lei cumpără o cameră”. Am verificat regulile de conformitate și am corectat în „10.000 lei reprezintă o contribuție la obiectivul comun de finanțare”. Nicio formă din aplicație nu oferă drepturi de cazare sau avantaje reale.', 'Eroare de limbaj: ')
bullet('Profilul rapid generat inițial („Vizitator Demo 60”) avea 17 caractere, peste limita de 16. A fost prins de testul Playwright pe viewport de telefon; am schimbat numele în „Demo Vizitator” și am adăugat validarea inline în splash.', 'Eroare reală prinsă în build: ')
bullet('AI a sugerat ca suma de matching să intre în totalul contribuțiilor. Am separat-o: progresul atinge 5.000 lei, iar suma deblocată apare ca „promisiune de matching (demo)”, niciodată ca fond primit.', 'Risc de raportare: ')
bullet('Toate cifrele oficiale (100.000.000 lei proiect total; 1.250.000 lei prima etapă) sunt citate ca „estimare publicată de Fundație”, cu link. Ipotezele de concurs (250.000 lei, 15.000 lei, 6 luni) sunt etichetate separat, nu ca ținte ale Fundației.', 'Verificare sursă: ')

heading('4. Ce depinde de AI la runtime și ce nu')
para('Nimic din fluxul principal nu depinde de AI: onboarding, plasare, provocări, cooldown, scut, niveluri, clasamente, matching, sponsori, share card, PWA și fallback 2D rulează local și offline după prima încărcare. Opțional, există un generator de mesaje pentru ambasadori, marcat explicit „șablon determinist, fără AI”; folosește numai text prestabilit și date fictive.')

heading('5. Verificare înainte de predare')
para('13 teste unitare Vitest pentru niveluri, validări, conversii, matching, anti-grief și clasamente; un test Playwright pe mobil pentru onboarding, plasare în 2D, contribuție simulată, impact și cerere de sponsorizare; teste manuale pentru WebGL indisponibil, localStorage blocat, cooldown, limba engleză și layout. Rezultat: toate trec; prototipul funcționează fără AI și fără backend.')

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(5)
r = p.add_run('Notă: acest jurnal descrie utilizarea AI în construcție, nu un sistem AI live. Toate numele, companiile și sumele din prototip sunt fictive; nu se efectuează plăți reale.')
r.italic = True; r.font.size = Pt(6.7); r.font.color.rgb = RGBColor(0x4E, 0x6B, 0x66)

doc.save(OUT)
print('saved', OUT)
