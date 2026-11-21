from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from pathlib import Path

OUT = Path('deliverables/Model_Financiar_TEAMCODE.xlsx')
wb = Workbook()
wb.remove(wb.active)

NAVY = '071C2A'; TEAL = '0E3A3A'; LIGHT = 'E9F7F2'; WHITE = 'FFFFFF'
thin = Side(style='thin', color='B8D8D0')
border = Border(left=thin, right=thin, top=thin, bottom=thin)
hfont = Font(name='Arial', bold=True, color=WHITE, size=11)
tfont = Font(name='Arial', bold=True, color=NAVY, size=16)
sfont = Font(name='Arial', bold=True, color=TEAL, size=11)
nfont = Font(name='Arial', color='18332E', size=10)
small = Font(name='Arial', color='4E6B66', size=9, italic=True)
input_fill = PatternFill('solid', fgColor='FFF3CD')
calc_fill = PatternFill('solid', fgColor='E3F7F0')
head_fill = PatternFill('solid', fgColor=TEAL)
sub_fill = PatternFill('solid', fgColor='DCEEE8')
money = '#,##0" lei"'
pct = '0.0%'


def sheet(name):
    ws = wb.create_sheet(name)
    ws.sheet_view.showGridLines = False
    ws.column_dimensions['A'].width = 46
    for c in 'BCDEF':
        ws.column_dimensions[c].width = 20
    return ws


def title(ws, text, sub=''):
    ws.merge_cells('A1:F1')
    ws['A1'] = text
    ws['A1'].font = tfont
    ws['A1'].fill = PatternFill('solid', fgColor=LIGHT)
    ws.row_dimensions[1].height = 28
    if sub:
        ws.merge_cells('A2:F2')
        ws['A2'] = sub
        ws['A2'].font = small
        ws['A2'].alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[2].height = 40


def header(ws, row, labels):
    for i, label in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=label)
        c.font = hfont
        c.fill = head_fill
        c.border = border
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[row].height = 28


def row(ws, r, values, kinds=None, numfmt=None, bold=False):
    for i, v in enumerate(values, 1):
        c = ws.cell(row=r, column=i, value=v)
        c.border = border
        c.font = Font(name='Arial', bold=bold, size=10, color='18332E')
        c.alignment = Alignment(wrap_text=True, vertical='top')
        if kinds and i - 1 < len(kinds):
            k = kinds[i - 1]
            if k == 'in':
                c.fill = input_fill
            elif k == 'calc':
                c.fill = calc_fill
            elif k == 'sub':
                c.fill = sub_fill
                c.font = sfont
        if numfmt and i in numfmt:
            c.number_format = numfmt[i]


# ------------------------------------------------------------------ Ipoteze
ws = sheet('Ipoteze')
title(ws, 'IPOTEZE – model financiar Bloc-Cu-Bloc (TEAMCODE)',
      'Toate valorile de mai jos sunt IPOTEZE DE CONCURS, nu ținte sau angajamente ale Fundației HIPOLITECH. Cifrele oficiale sunt afișate separat, cu atribuire. Datele sunt demonstrative.')
header(ws, 4, ['Parametru', 'Valoare', 'Unitate', 'Sursă / notă'])
data = [
    ('Obiectiv fundraising brut', 250000, 'lei', 'Ipoteză de concurs; nu este o țintă a Fundației'),
    ('Buget maxim campanie', 15000, 'lei', 'Ipoteză de concurs; limita superioară'),
    ('Durată campanie', 6, 'luni', 'Ipoteză de concurs'),
    ('Donatori individuali (scenariu de bază)', 500, 'persoane', 'Scenariu de lucru, nu rezultat garantat'),
    ('Contribuție medie individuală', 100, 'lei', 'Scenariu de lucru'),
    ('Sponsori (scenariu de bază)', 20, 'companii', 'Scenariu de lucru; companii fictive în demo'),
    ('Sponsorizare medie', 10000, 'lei', 'Scenariu de lucru'),
    ('Contacte individuale eligibile', 12500, 'persoane', 'Bază definită în Funnel'),
    ('Rată conversie individuală anticipată', 0.04, '%', 'Donatori confirmați / contacte eligibile'),
    ('Contacte companii eligibile', 400, 'companii', 'Bază definită în Funnel'),
    ('Rată conversie companii anticipată', 0.05, '%', 'Sponsori confirmați / contacte eligibile'),
    ('Rată de încasare donatori individuali', 0.90, '%', 'Nu presupunem că toate promisiunile sunt colectate'),
    ('Rată de încasare sponsori', 0.80, '%', 'Nu presupunem că toate promisiunile sunt colectate'),
    ('Cheltuieli relevante pentru achiziția donatorilor', 7500, 'lei', 'Social + conținut + landing; vezi Buget'),
    ('Vizitatori estimați', 8000, 'vizite', 'Ipoteză de test, luna 1'),
    ('Cereri demo de sponsorizare', 50, 'cereri', 'Interes măsurat în prototip (simulat)'),
]
for i, (a, b, c, d) in enumerate(data, 5):
    row(ws, i, [a, b, c, d], kinds=['sub', 'in', None, None])
    if i in (13, 15, 16, 17):
        ws.cell(row=i, column=2).number_format = pct
    elif i in (5, 6, 9, 11, 18):
        ws.cell(row=i, column=2).number_format = money
    ws.row_dimensions[i].height = 28
ws.merge_cells('A22:F22')
ws['A22'] = 'CIFRE OFICIALE (estimare publicată de Fundație) – NU sunt ținte de campanie'
ws['A22'].font = Font(name='Arial', bold=True, color=NAVY, size=11)
ws['A22'].fill = PatternFill('solid', fgColor='FFF0CC')
row(ws, 23, ['Proiect total (estimare publicată de Fundație)', 100000000, 'lei', 'Sursa: Fundația HIPOLITECH, pagina campaniei'], kinds=['sub', 'calc', None, None])
ws.cell(row=23, column=2).number_format = money
row(ws, 24, ['Prima etapă: proiectare, avize, autorizații (estimare publicată de Fundație)', 1250000, 'lei', 'Sursa: Fundația HIPOLITECH, pagina campaniei'], kinds=['sub', 'calc', None, None])
ws.cell(row=24, column=2).number_format = money
ws.merge_cells('A26:F26')
ws['A26'] = 'Legendă: galben = input editabil; verde = formulă calculată. Cifrele oficiale sunt informative, nu obiective de campanie.'
ws['A26'].font = small

# ------------------------------------------------------------------ Calcule
ws = sheet('Calcule')
title(ws, 'CALCULE – reconciliere brut / costuri / net', 'Formulele sunt active și editabile. Inputurile se schimbă în foaia Ipoteze; bugetul în foaia Buget.')
header(ws, 4, ['Indicator', 'Valoare', 'Formulă / notă'])
calcs = [
    ('Donatori individuali confirmați', '=Ipoteze!B8', 'din Ipoteze', money),
    ('Contribuție medie individuală', '=Ipoteze!B9', 'din Ipoteze', money),
    ('Donații individuale', '=B5*B6', 'donatori × contribuție medie', money),
    ('Sponsori confirmați', '=Ipoteze!B10', 'din Ipoteze', '#,##0'),
    ('Sponsorizare medie', '=Ipoteze!B11', 'din Ipoteze', money),
    ('Sponsorizări', '=B8*B9', 'sponsori × sponsorizare medie', money),
    ('Brut campanie', '=B7+B10', 'donații individuale + sponsorizări', money),
    ('Costuri campanie', '=Buget!B14', 'din Buget (fiecare cost o singură dată)', money),
    ('Net campanie', '=B11-B12', 'brut − costuri', money),
    ('Rată conversie individuală', '=Ipoteze!B13', 'donatori confirmați / contacte eligibile', pct),
    ('Contacte individuale necesare', '=IF(B14>0,B5/B14,0)', 'donatori / rată conversie', '#,##0'),
    ('Rată conversie companii', '=Ipoteze!B15', 'sponsori confirmați / contacte eligibile', pct),
    ('Contacte companii necesare', '=IF(B16>0,B8/B16,0)', 'sponsori / rată conversie', '#,##0'),
    ('Cost per donator (cheltuieli relevante)', '=Ipoteze!B18/B5', 'cheltuieli relevante / donatori confirmați', money),
    ('Cost total per donator', '=B12/B5', 'buget total / donatori confirmați', money),
    ('Verificare brut vs obiectiv', '=IF(ABS(B11-Ipoteze!B5)<0.01,"OK – brut = obiectiv","ATENȚIE – diferență")', 'control', None),
    ('Verificare net', '=IF(ABS(B13-(B11-B12))<0.01,"OK – net = brut − costuri","ATENȚIE")', 'control', None),
]
for i, (a, b, c, fmt) in enumerate(calcs, 5):
    row(ws, i, [a, b, c], kinds=['sub', 'calc', None])
    if fmt:
        ws.cell(row=i, column=2).number_format = fmt
    ws.row_dimensions[i].height = 25

# ------------------------------------------------------------------ Buget
ws = sheet('Buget')
title(ws, 'BUGET CAMPANIE – maximum 15.000 lei (ipoteză de concurs)', 'Fiecare cost apare o singură dată. Totalul este sub sau egal cu limita. Sumele sunt ipoteze de lucru, adaptate exemplului de concurs; nu sunt cheltuieli angajate.')
header(ws, 4, ['Categorie de cost', 'Cost (lei)', 'Inclus o singură dată?', 'Notă / justificare'])
items = [
    ('Promovare social media (Meta/TikTok, buget fix)', 5400, 'Da', 'Test A/B pe două mesaje; buget fix.'),
    ('Producție conținut foto/video', 2400, 'Da', 'Materiale pentru social și campus; o singură producție.'),
    ('Landing page, domeniu și găzduire (6 luni)', 600, 'Da', 'Pagină de campanie și măsurare.'),
    ('Instrument email/CRM (6 luni)', 450, 'Da', 'Comunicare către liste existente, cu consimțământ.'),
    ('Materiale tipărite și QR pentru campus', 1200, 'Da', 'Afișe și carduri QR; o singură tipărire.'),
    ('Stand și eveniment în campus', 1500, 'Da', 'Prezență fizică, fără costuri de personal inventate.'),
    ('Colaborare cu creatori demo (micro)', 1800, 'Da', 'Colaborare plătită, dezvăluită ca atare.'),
    ('Materiale outreach companii', 750, 'Da', 'Prezentare, fișe; fără liste cumpărate.'),
    ('Rezervă de contingență', 900, 'Da', 'Max. 6% din buget; se folosește doar dacă e necesar.'),
]
for i, (a, b, c, d) in enumerate(items, 5):
    row(ws, i, [a, b, c, d], kinds=['sub', 'in', None, None])
    ws.cell(row=i, column=2).number_format = money
    ws.row_dimensions[i].height = 30
row(ws, 14, ['TOTAL BUGET', '=SUM(B5:B13)', '', ''], kinds=['sub', 'calc', None, None], bold=True)
ws.cell(row=14, column=2).number_format = money
row(ws, 15, ['Limită maximă (ipoteză de concurs)', '=Ipoteze!B6', '', 'Fiecare cost este numărat o singură dată.'], kinds=['sub', 'calc', None, None])
ws.cell(row=15, column=2).number_format = money
row(ws, 16, ['Verificare buget', '=IF(B14<=B15,"OK – în limita de 15.000 lei","DEPĂȘIRE – reduceți costurile")', '', 'Control automat'], kinds=['sub', 'calc', None, None])
row(ws, 17, ['Diferență față de limită', '=B15-B14', '', 'Poate rămâne necheltuită.'], kinds=['sub', 'calc', None, None])
ws.cell(row=17, column=2).number_format = money
ws.merge_cells('A19:F19')
ws['A19'] = 'Notă: bugetul este o ipoteză de planificare. Nu include cheltuieli cu personal, chirii sau obligații reale; toate costurile trebuie validate cu furnizori reali înainte de angajare.'
ws['A19'].font = small
ws['A19'].alignment = Alignment(wrap_text=True)
ws.row_dimensions[19].height = 34

# ------------------------------------------------------------------ Funnel
ws = sheet('Funnel')
title(ws, 'FUNNEL – persoane și companii de abordat', 'Definiția bazei: contacte eligibile = persoane/companii contactate prin canale legitime, excluzând duplicate, minori și persoane fără canal valid sau consimțământ acolo unde este necesar. Conversia = confirmați / contacte eligibile.')
header(ws, 4, ['Etapă', 'Valoare', 'Definiție / formulă'])
funnel = [
    ('Contacte individuale eligibile', '=Ipoteze!B12', 'Baza de calcul, nu lista totală deținută.', '#,##0'),
    ('Rată conversie individuală', '=Ipoteze!B13', 'Donatori confirmați / contacte eligibile.', pct),
    ('Donatori individuali confirmați', '=ROUND(B5*B6,0)', 'Conversie aplicată bazei eligibile.', '#,##0'),
    ('Contacte companii eligibile', '=Ipoteze!B14', 'Companii contactate prin canale legitime.', '#,##0'),
    ('Rată conversie companii', '=Ipoteze!B15', 'Sponsori confirmați / contacte eligibile.', pct),
    ('Sponsori confirmați', '=ROUND(B8*B9,0)', 'Conversie aplicată bazei eligibile.', '#,##0'),
    ('Cost relevant achiziție donatori', '=Ipoteze!B18', 'Social + conținut + landing.', money),
    ('Cost per donator', '=B11/B7', 'Cheltuieli relevante / donatori confirmați.', money),
    ('Cost total per donator', '=Buget!B14/B7', 'Buget total / donatori confirmați.', money),
    ('Cost outreach companii', '=Buget!B12', 'Materiale outreach (750 lei).', money),
    ('Cost per sponsor', '=B14/B10', 'Cost outreach / sponsori confirmați.', money),
    ('Vizitatori estimați (luna 1)', '=Ipoteze!B19', 'Ipoteză de test, nu trafic garantat.', '#,##0'),
    ('Rată vizitator → donator', '=IF(B16>0,B7/B16,0)', 'Donatori confirmați / vizitatori.', pct),
    ('Cereri demo de sponsorizare', '=Ipoteze!B20', 'Interes măsurat în prototip (simulat).', '#,##0'),
    ('Rată interes → discuție', '=IF(B18>0,B10/B18,0)', 'Sponsori confirmați / cereri demo.', pct),
]
for i, (a, b, c, fmt) in enumerate(funnel, 5):
    row(ws, i, [a, b, c], kinds=['sub', 'calc', None])
    ws.cell(row=i, column=2).number_format = fmt
    ws.row_dimensions[i].height = 30
ws.merge_cells('A21:F21')
ws['A21'] = 'Răspuns: pentru scenariul de bază trebuie abordate ~12.500 persoane eligibile (4% conversie) și ~400 companii (5% conversie). Conversia este credibilă doar dacă baza este caldă (alumni, campus, intro-uri) și dacă mesajul separă clar simularea de donația reală. Costul per donator se calculează doar pe cheltuielile relevante, nu pe tot bugetul.'
ws['A21'].font = nfont
ws['A21'].alignment = Alignment(wrap_text=True, vertical='top')
ws.row_dimensions[21].height = 74

# ------------------------------------------------------------------ Scenarii
ws = sheet('Scenarii')
title(ws, 'SCENARII – brut, costuri și net', 'Baza: 500 donatori × 100 lei + 20 sponsori × 10.000 lei = 250.000 lei brut; net 235.000 lei după costuri de 15.000 lei. Scenariul C permite introducerea unor valori proprii.')
header(ws, 4, ['Element', 'Bază', 'Scenariu A: contribuție medie −30%', 'Scenariu B: sponsori înjumătățiți', 'Scenariu C: custom'])
rows = [
    ('Donatori individuali', '=Ipoteze!B8', '=Ipoteze!B8', '=Ipoteze!B8', 500, '#,##0'),
    ('Contribuție medie individuală', '=Ipoteze!B9', '=Ipoteze!B9*0.7', '=Ipoteze!B9', 100, money),
    ('Donații individuale', '=B5*B6', '=C5*C6', '=D5*D6', '=E5*E6', money),
    ('Sponsori', '=Ipoteze!B10', '=Ipoteze!B10', '=Ipoteze!B10/2', 20, '#,##0'),
    ('Sponsorizare medie', '=Ipoteze!B11', '=Ipoteze!B11', '=Ipoteze!B11', 10000, money),
    ('Sponsorizări', '=B8*B9', '=C8*C9', '=D8*D9', '=E8*E9', money),
    ('Brut', '=B7+B10', '=C7+C10', '=D7+D10', '=E7+E10', money),
    ('Costuri campanie', '=Buget!B14', '=Buget!B14', '=Buget!B14', 15000, money),
    ('Net', '=B11-B12', '=C11-C12', '=D11-D12', '=E11-E12', money),
    ('% din obiectivul brut', '=B11/Ipoteze!B5', '=C11/Ipoteze!B5', '=D11/Ipoteze!B5', '=E11/Ipoteze!B5', pct),
]
for i, (a, b, c, d, e, fmt) in enumerate(rows, 5):
    row(ws, i, [a, b, c, d, e], kinds=['sub', 'calc', 'calc', 'calc', 'calc'])
    for col in 'BCDE':
        ws[f'{col}{i}'].number_format = fmt
    ws.row_dimensions[i].height = 26
for cell in ['E5', 'E6', 'E8', 'E9', 'E12']:
    ws[cell].fill = input_fill
ws.merge_cells('A16:F16')
ws['A16'] = 'Scenariul A reduce contribuția medie cu 30% și păstrează sponsori; scenariul B păstrează donatorii dar înjumătățește numărul de sponsori. Scenariul C este editabil (celule galbene). Toate sumele sunt simulate în prototip; nu reprezintă încasări reale.'
ws['A16'].font = small
ws['A16'].alignment = Alignment(wrap_text=True)
ws.row_dimensions[16].height = 38
row(ws, 18, ['Verificare bază = obiectiv', '=IF(ABS(B11-Ipoteze!B5)<0.01,"OK","ATENȚIE")', '', '', ''], kinds=['sub', 'calc'])
row(ws, 19, ['Verificare net bază', '=IF(ABS(B13-(B11-B12))<0.01,"OK","ATENȚIE")', '', '', ''], kinds=['sub', 'calc'])

# ------------------------------------------------------------------ Pledged vs received
ws = sheet('Pledged vs Received')
title(ws, 'PROMIS VS PRIMIT – nu presupunem că toate promisiunile sunt colectate', 'Pledged = sume promise în scenariul de lucru. Received = sume estimate a fi încasate, cu rată de colectare explicită. Prototipul nu înregistrează plăți reale.')
header(ws, 4, ['Indicator', 'Valoare', 'Formulă / notă'])
pr = [
    ('Donații individuale promise', '=Calcule!B7', 'Pledged individual', money),
    ('Sponsorizări promise', '=Calcule!B10', 'Pledged sponsorships', money),
    ('Total promis', '=B5+B6', 'Pledged total', money),
    ('Rată încasare donatori individuali', '=Ipoteze!B16', 'Explicită, nu 100%', pct),
    ('Rată încasare sponsori', '=Ipoteze!B17', 'Explicită, nu 100%', pct),
    ('Donații individuale estimate a fi primite', '=B5*B8', 'Pledged × rată încasare', money),
    ('Sponsorizări estimate a fi primite', '=B6*B9', 'Pledged × rată încasare', money),
    ('Total estimat primit', '=B10+B11', 'Received total estimat', money),
    ('Diferență promis − primit', '=B7-B12', 'Gap de colectare', money),
    ('Contribuții simulate în prototip', 0, 'Nu sunt fonduri reale; nu se adaugă la primit', money),
]
for i, (a, b, c, fmt) in enumerate(pr, 5):
    kinds = ['sub', 'in', None] if i == 14 else ['sub', 'calc', None]
    row(ws, i, [a, b, c], kinds=kinds)
    ws.cell(row=i, column=2).number_format = fmt
    ws.row_dimensions[i].height = 28
ws.merge_cells('A16:F16')
ws['A16'] = 'Regulă de comunicare: nu spunem că sumele promise sunt bani încasați. În prototip, totalul simulat și promisiunea de matching sunt afișate separat de orice contribuție reală. Sursa cifrelor oficiale: pagina Fundației HIPOLITECH.'
ws['A16'].font = small
ws['A16'].alignment = Alignment(wrap_text=True)
ws.row_dimensions[16].height = 40

# ------------------------------------------------------------------ Verificări
ws = sheet('Verificări')
title(ws, 'VERIFICĂRI ȘI ÎNTREBĂRI DE VALIDARE', 'Controale automate + răspunsuri scurte. Dacă o valoare este modificată, formulele se recalculează.')
header(ws, 4, ['Control', 'Rezultat', 'Detaliu'])
checks = [
    ('Buget ≤ 15.000 lei', '=IF(Buget!B14<=Ipoteze!B6,"OK","ATENȚIE")', 'Buget total / limită'),
    ('Buget exact la limită (opțional)', '=IF(Buget!B14=Ipoteze!B6,"Exact 15.000 lei","Rămâne disponibil")', 'Nu este obligatoriu să consumi tot'),
    ('Brut = donații + sponsorizări', '=IF(ABS(Calcule!B11-(Calcule!B7+Calcule!B10))<0.01,"OK","ATENȚIE")', 'Calcule!B11'),
    ('Net = brut − costuri', '=IF(ABS(Calcule!B13-(Calcule!B11-Calcule!B12))<0.01,"OK","ATENȚIE")', 'Calcule!B13'),
    ('Scenariu bază atinge obiectivul', '=IF(ABS(Scenarii!B11-Ipoteze!B5)<0.01,"OK","ATENȚIE")', 'Scenarii!B11'),
    ('Conversie = donatori / contacte eligibile', '=IF(ABS(Calcule!B14-Ipoteze!B13)<0.0001,"OK","ATENȚIE")', 'Definiție explicită în Funnel'),
    ('Cost per donator > 0', '=IF(Calcule!B18>0,"OK","ATENȚIE")', 'Doar cheltuieli relevante'),
    ('Pledged vs received separat', '=IF(B6>=0,"OK – coloane separate","ATENȚIE")', 'Vezi foaia dedicată'),
    ('Nu există costuri duplicate', '=IF(Buget!B14=SUM(Buget!B5:B13),"OK – fiecare cost o dată","ATENȚIE")', 'Sumă unică'),
]
for i, (a, b, c) in enumerate(checks, 5):
    row(ws, i, [a, b, c], kinds=['sub', 'calc', None])
    ws.row_dimensions[i].height = 24
ws.merge_cells('A16:F16')
ws['A16'] = 'RĂSPUNSURI PENTRU EVALUARE'
ws['A16'].font = Font(name='Arial', bold=True, size=12, color=NAVY)
ws['A16'].fill = PatternFill('solid', fgColor='FFF0CC')
qa = [
    ('Câți oameni/companii trebuie abordați?', '=CONCATENATE("~",TEXT(Calcule!B15,"#,##0")," persoane eligibile și ~",TEXT(Calcule!B17,"#,##0")," companii eligibile pentru scenariul de bază.")', 'Baza și conversia sunt definite în Funnel.'),
    ('Ce conversie e necesară și de ce e credibilă?', '4% donatori individuali / 5% sponsori. Credibilă doar cu liste calde (alumni, campus, intro-uri) și mesaj care separă simularea de donația reală.', 'Nu folosim liste cumpărate; conversia se validează în luna 1.'),
    ('Ce informații lipsesc pentru validarea în realitate?', 'Costurile reale ale furnizorilor; rata reală de click/donație; numărul de absolvenți contactabili cu consimțământ; apetitul companiilor; sumele efectiv încasate de Fundație; calendarul campaniei.', 'Se validează cu Fundația și furnizori înainte de angajarea bugetului.'),
    ('Cum tratăm sumele promise?', 'Separat de sumele primite. Nu presupunem colectarea integrală: 90% donatori individuali, 80% sponsori în scenariul de bază.', 'Vezi foaia Pledged vs Received.'),
    ('Ce spunem despre prototip?', 'Este un prototip de concurs cu date demonstrative; contribuțiile sunt simulate; nu oferă drepturi de cazare sau avantaje reale; pentru sprijin real se folosește pagina oficială a Fundației.', 'Text aplicat în UI și în materialele promo.'),
]
for i, (q, a, note) in enumerate(qa, 17):
    ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=2)
    ws.cell(row=i, column=1, value=q).font = sfont
    ws.cell(row=i, column=1).alignment = Alignment(wrap_text=True, vertical='top')
    ws.merge_cells(start_row=i, start_column=3, end_row=i, end_column=6)
    ws.cell(row=i, column=3, value=a).font = nfont
    ws.cell(row=i, column=3).alignment = Alignment(wrap_text=True, vertical='top')
    for col in range(1, 7):
        ws.cell(row=i, column=col).border = border
    ws.row_dimensions[i].height = 48
ws.merge_cells('A24:F24')
ws['A24'] = 'Sursă oficială: https://fundatia.upb.ro/proiecte-si-evenimente/un-loc-in-camin-poate-schimba-un-destin/ · Cifrele oficiale sunt estimări publicate de Fundație. Modelul este o ipoteză de concurs, nu un buget aprobat.'
ws['A24'].font = small
ws['A24'].alignment = Alignment(wrap_text=True)
ws.row_dimensions[24].height = 34

wb.save(OUT)
print('saved', OUT)
