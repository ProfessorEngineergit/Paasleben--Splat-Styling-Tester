#!/usr/bin/env python3
"""Build the concise, screenshot-led website and editor guide."""

from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from PIL import Image
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DECK = ROOT / "output" / "Paasleben-Uebergabe-Maren.pptx"
OUTPUT = ROOT / "output" / "pdf" / "Paasleben-Kurzanleitung.pdf"
PHONE_FRAME = ROOT / "tools" / "assets" / "generic-mobile-frame.png"
COACHING_REFERENCE = ROOT / "tools" / "assets" / "coaching-campus-reference.png"

PAGE_W, PAGE_H = 960, 540
PAPER = HexColor("#f4ecd8")
PAPER_PALE = HexColor("#faf5e6")
PAPER_EDGE = HexColor("#d8cdb4")
INK = HexColor("#1a1814")
INK_2 = HexColor("#2a2620")
MUTED = HexColor("#6b5f4e")
FAINT = HexColor("#918673")
RED = HexColor("#b8342f")
GREEN = HexColor("#24463b")
ORANGE = HexColor("#e98517")
WHITE = HexColor("#ffffff")
BLACK = HexColor("#10100e")

LIVE_URL = "https://paasleben.com/"
EDITOR_URL = LIVE_URL + "admin.html"


def media(zip_file, name):
    return zip_file.read(f"ppt/media/{name}")


def image_reader(data):
    return ImageReader(BytesIO(data))


def cropped_reader(data, crop):
    with Image.open(BytesIO(data)) as source:
        cropped = source.crop(crop).convert("RGB")
        output = BytesIO()
        cropped.save(output, format="JPEG", quality=92, optimize=True)
    output.seek(0)
    return ImageReader(output)


def wrap_lines(text, font, size, max_width):
    lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if stringWidth(candidate, font, size) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def draw_wrapped(c, text, x, y, max_width, size=15, leading=None,
                 font="Helvetica", color=INK_2, max_lines=None):
    leading = leading or size * 1.28
    lines = wrap_lines(text, font, size, max_width)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_page_header(c, section, title, subtitle=None):
    c.setFillColor(FAINT)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(54, 505, section.upper())
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(54, 468, title)
    if subtitle:
        draw_wrapped(c, subtitle, 54, 440, 850, size=14, color=MUTED)


def draw_footer(c, page_number):
    c.setStrokeColor(PAPER_EDGE)
    c.setLineWidth(0.7)
    c.line(54, 28, 906, 28)
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(FAINT)
    c.drawString(54, 14, "PAASLEBEN · KURZANLEITUNG")
    c.setFillColor(RED)
    c.drawRightString(906, 14, f"{page_number:02d}")


def page_background(c, color=PAPER):
    c.setFillColor(color)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)


def draw_image_cover(c, image, x, y, width, height, radius=0):
    iw, ih = image.getSize()
    scale = max(width / iw, height / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (width - dw) / 2, y + (height - dh) / 2
    c.saveState()
    path = c.beginPath()
    if radius:
        path.roundRect(x, y, width, height, radius)
    else:
        path.rect(x, y, width, height)
    c.clipPath(path, stroke=0, fill=0)
    c.drawImage(image, dx, dy, dw, dh, mask="auto")
    c.restoreState()


def draw_browser(c, image, x, y, width, height, label="Desktop", crop=True):
    chrome = 24
    c.saveState()
    c.setFillColor(Color(0, 0, 0, alpha=0.12))
    c.roundRect(x + 5, y - 6, width, height, 9, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.roundRect(x, y, width, height, 9, stroke=0, fill=1)
    c.setFillColor(HexColor("#f1efea"))
    c.roundRect(x, y + height - chrome, width, chrome, 9, stroke=0, fill=1)
    c.rect(x, y + height - chrome, width, 10, stroke=0, fill=1)
    for index, color in enumerate(("#d65b52", "#e2ad3c", "#5eaa62")):
        c.setFillColor(HexColor(color))
        c.circle(x + 14 + index * 12, y + height - 12, 3.2, stroke=0, fill=1)
    c.setFillColor(HexColor("#dedbd4"))
    c.roundRect(x + 65, y + height - 18, width - 130, 12, 6, stroke=0, fill=1)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(MUTED)
    c.drawCentredString(x + width / 2, y + height - 15, label)
    if crop:
        draw_image_cover(c, image, x, y, width, height - chrome)
    else:
        c.drawImage(image, x, y, width, height - chrome, preserveAspectRatio=True, anchor="c", mask="auto")
    c.setStrokeColor(PAPER_EDGE)
    c.roundRect(x, y, width, height, 9, stroke=1, fill=0)
    c.restoreState()
    return (x, y, width, height - chrome)


def draw_phone(c, image, frame, x, y, width, height, label="Mobil"):
    """Composite the real site capture into a neutral, photorealistic frame."""
    screen_x = x + width * .035
    screen_y = y + height * .027
    screen_w = width * .93
    screen_h = height * .947
    c.setFillColor(Color(0, 0, 0, alpha=0.12))
    c.roundRect(x + 5, y - 6, width, height, width * .13, stroke=0, fill=1)
    c.setFillColor(HexColor("#181817"))
    c.roundRect(x, y, width, height, width * .13, stroke=0, fill=1)
    draw_image_cover(c, image, screen_x, screen_y, screen_w, screen_h,
                     radius=width * .105)
    c.drawImage(frame, x, y, width, height, mask="auto")
    c.setFillColor(INK)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(x + width / 2, y - 16, label)


def draw_number(c, number, x, y, dark=False):
    c.setFillColor(INK if dark else RED)
    c.circle(x, y, 8.5, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawCentredString(x, y - 2.6, str(number))


def draw_instruction(c, number, title, body, x, y, width):
    draw_number(c, number, x + 9, y - 2)
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(INK)
    c.drawString(x + 28, y, title)
    draw_wrapped(c, body, x + 28, y - 17, width - 28, size=9.5, leading=12.5, color=MUTED)


def draw_pill(c, text, x, y, width, fill=INK, color=WHITE):
    c.setFillColor(fill)
    c.roundRect(x, y, width, 24, 12, stroke=0, fill=1)
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(x + width / 2, y + 8, text.upper())


def draw_editor_toolbar(c, x, y, width):
    c.setFillColor(PAPER_PALE)
    c.rect(x, y, width, 28, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 6.4)
    c.drawString(x + 9, y + 11, "Paasleben  ·  Editor")
    cursor = x + width - 324
    controls = [
        ("Rückgängig", 50), ("Wiederholen", 52), ("Neuer Ort", 52),
        ("Draufsicht", 48), ("Design", 42),
    ]
    for label, control_width in controls:
        c.setFillColor(WHITE)
        c.setStrokeColor(PAPER_EDGE)
        c.roundRect(cursor, y + 5, control_width, 18, 3, stroke=1, fill=1)
        c.setFillColor(INK)
        c.setFont("Helvetica", 5.4)
        c.drawCentredString(cursor + control_width / 2, y + 11.2, label)
        cursor += control_width + 5


def add_cover(c, desktop):
    page_background(c)
    c.setFillColor(FAINT)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(54, 496, "WEBSITE · EDITOR · DESIGN")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 36)
    c.drawString(54, 447, "Paasleben")
    c.setFillColor(RED)
    c.rect(54, 421, 82, 2, stroke=0, fill=1)
    c.setFont("Helvetica", 20)
    c.setFillColor(MUTED)
    c.drawString(54, 383, "Website und Editor kurz erklärt")
    draw_wrapped(c, "Bedienung auf Desktop und Mobil, Designsystem, Inhalte pflegen und die wichtigsten Links.", 54, 345, 340, size=13, leading=17, color=MUTED)
    draw_pill(c, "Kurzanleitung", 54, 80, 128)
    draw_browser(c, desktop, 420, 62, 490, 404, label="paasleben.com  ·  Desktop")
    c.showPage()


def add_desktop_page(c, desktop):
    page_background(c)
    draw_page_header(c, "01 · Website", "Am Computer: Karte bewegen und Orte öffnen")
    sx, sy, sw, sh = draw_browser(c, desktop, 48, 88, 626, 330, label=LIVE_URL.replace("https://", ""))
    draw_number(c, 1, sx + sw * .53, sy + sh * .77)
    draw_number(c, 2, sx + sw * .90, sy + sh * .94)
    draw_number(c, 3, sx + sw * .52, sy + sh * .43)
    c.setFillColor(PAPER_PALE)
    c.roundRect(700, 88, 212, 330, 8, stroke=0, fill=1)
    draw_instruction(c, 1, "Ort öffnen", "Ein Schild anklicken. Der Inhalt öffnet sich direkt über der Karte.", 716, 385, 180)
    draw_instruction(c, 2, "Oben rechts", "Ton an/aus, Draufsicht und kurze Bedienhilfe.", 716, 298, 180)
    draw_instruction(c, 3, "Karte verschieben", "Mit der linken Maustaste ziehen. Auf Touch: mit einem Finger.", 716, 221, 180)
    draw_wrapped(c, "Der normale Browser-Zoom und Doppeltipp-Zoom sind gesperrt. So verrutscht die Seite nicht versehentlich.", 716, 135, 178, size=10, leading=13, color=MUTED)
    draw_footer(c, 2)
    c.showPage()


def add_detail_page(c, detail):
    page_background(c)
    draw_page_header(c, "02 · Ein Ort", "Öffnen, lesen, schließen", "Die Karte bleibt im Hintergrund. Text und Fotos liegen im geöffneten Bereich.")
    sx, sy, sw, sh = draw_browser(c, detail, 48, 82, 646, 330, label="Geöffneter Ort · Desktop")
    draw_number(c, 1, sx + sw * .50, sy + sh * .84)
    draw_number(c, 2, sx + sw * .50, sy + sh * .29)
    c.setFillColor(PAPER_PALE)
    c.roundRect(718, 82, 194, 330, 8, stroke=0, fill=1)
    draw_instruction(c, 1, "Schließen", "Der Knopf führt zurück zur Übersicht.", 733, 378, 164)
    draw_instruction(c, 2, "Nach unten scrollen", "Dort stehen der ganze Text und die Bilder des Ortes.", 733, 302, 164)
    draw_instruction(c, 3, "Text kopieren", "Textauswahl ist im eigentlichen Lesebereich möglich.", 733, 216, 164)
    draw_instruction(c, 4, "Direkt verlinken", "Jeder Ort hat eine eigene Adresse. Beispiel: ?ort=08.", 733, 142, 164)
    draw_footer(c, 3)
    c.showPage()


def add_mobile_page(c, mobile, phone_frame):
    page_background(c)
    draw_page_header(c, "03 · Mobil", "Gleiche Inhalte, kompakt angeordnet")
    draw_phone(c, mobile, phone_frame, 398, 68, 164, 362, label="Mobil · geöffneter Ort")
    c.setFillColor(PAPER_PALE)
    c.roundRect(54, 106, 252, 284, 8, stroke=0, fill=1)
    draw_instruction(c, 1, "Punkte antippen", "Auf der Karte oder in der Ortsleiste unten.", 72, 354, 215)
    draw_instruction(c, 2, "Weiterblättern", "Ist ein Ort offen, wechseln die Pfeile unten direkt zum vorherigen oder nächsten Ort.", 72, 269, 215)
    draw_instruction(c, 3, "Beim Lesen ruhig", "Beim Scrollen verschwinden die Bedienleisten. Die Pfeile kommen oben wieder zurück.", 72, 169, 215)
    c.setFillColor(PAPER_PALE)
    c.roundRect(654, 106, 252, 284, 8, stroke=0, fill=1)
    draw_instruction(c, 4, "Ein Finger", "Verschiebt die Karte. Zwei Finger steuern die Karte, nicht die Webseite.", 672, 354, 215)
    draw_instruction(c, 5, "Schließen", "Bringt die Ortsleiste und alle Punkte wieder zurück.", 672, 269, 215)
    draw_instruction(c, 6, "Ton", "Wird beim Verlassen der Seite sofort stummgeschaltet.", 672, 184, 215)
    draw_footer(c, 4)
    c.showPage()


def draw_design_option(c, x, y, width, title, fonts, reason,
                       background, accent, ink, recommended=False):
    c.setFillColor(background)
    c.setStrokeColor(accent if recommended else PAPER_EDGE)
    c.setLineWidth(1.4 if recommended else .7)
    c.roundRect(x, y, width, 134, 8, stroke=1, fill=1)
    c.setFillColor(accent)
    c.rect(x, y, 5, 134, stroke=0, fill=1)
    if recommended:
        c.setFillColor(accent)
        c.roundRect(x + width - 76, y + 106, 64, 17, 8.5, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 5.8)
        c.drawCentredString(x + width - 44, y + 112, "EMPFOHLEN")
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(x + 18, y + 108, title)
    c.setFont("Helvetica", 7.7)
    c.setFillColor(MUTED)
    c.drawString(x + 18, y + 90, fonts)
    for index, color in enumerate((background, accent, ink)):
        c.setFillColor(color)
        c.setStrokeColor(PAPER_EDGE)
        c.circle(x + 24 + index * 23, y + 68, 7, stroke=1, fill=1)
    draw_wrapped(c, reason, x + 18, y + 44, width - 34,
                 size=8.5, leading=11, color=MUTED, max_lines=3)


def add_design_page(c, desktop, coaching_reference):
    page_background(c)
    draw_page_header(c, "04 · Designsystem", "Drei Varianten, ein gemeinsamer Aufbau",
                     "Bestehende Website und 3D-Seite bleiben erkennbar verwandt. Im Editor lassen sich alle drei Varianten sofort vergleichen.")
    draw_browser(c, coaching_reference, 54, 260, 400, 164,
                 label="Bestehende Website · Referenz")
    draw_browser(c, desktop, 506, 260, 400, 164,
                 label="paasleben.com · 3D-Seite")
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(MUTED)
    c.drawString(54, 239, "REFERENZ")
    c.drawString(506, 239, "3D-STRUKTUR")
    c.setFont("Helvetica", 8.2)
    c.setFillColor(MUTED)
    c.drawString(54, 222, "Klare Typografie und ein einzelner orangener Akzent.")
    c.drawString(506, 222, "Ruhige Oberfläche, damit Karte und Orte im Vordergrund bleiben.")
    draw_design_option(
        c, 54, 62, 276, "1 · Coaching Campus", "Oxygen  /  Barlow Condensed",
        "Sachlich, hell und nah am bisherigen Auftritt.",
        HexColor("#f8f8f6"), HexColor("#ea8200"), HexColor("#403a3c"),
    )
    draw_design_option(
        c, 342, 62, 276, "2 · 3D", "Cormorant Garamond  /  Courier",
        "Warme Bühne; Landschaft, Orte und Bilder tragen die Seite.",
        PAPER, RED, INK,
    )
    draw_design_option(
        c, 630, 62, 276, "3 · Verbunden", "Fraunces  /  Inter",
        "Verbindet die Wärme der Karte mit der Klarheit der Referenz.",
        HexColor("#f2ebd9"), HexColor("#b8562b"), GREEN, recommended=True,
    )
    draw_footer(c, 5)
    c.showPage()


def add_editor_page(c, editor):
    page_background(c)
    draw_page_header(c, "05 · Editor", "Karte und Inhalte an einer Stelle pflegen")
    sx, sy, sw, sh = draw_browser(c, editor, 42, 76, 678, 355, label="Editor · /admin.html")
    draw_editor_toolbar(c, sx, sy + sh - 28, sw)
    draw_number(c, 1, sx + sw * .59, sy + sh * .94)
    draw_number(c, 2, sx + sw * .37, sy + sh * .54)
    draw_number(c, 3, sx + sw * .86, sy + sh * .94)
    draw_number(c, 4, sx + sw * .92, sy + sh * .48)
    c.setFillColor(PAPER_PALE)
    c.roundRect(744, 76, 168, 355, 8, stroke=0, fill=1)
    draw_instruction(c, 1, "Rückgängig", "Oben stehen Rückgängig und Wiederholen. Auch mit Cmd/Ctrl+Z.", 758, 397, 140)
    draw_instruction(c, 2, "Map bedienen", "Links/1 Finger verschieben. Rechts/2 Finger drehen. Rad/Pinch zoomt die Map.", 758, 304, 140)
    draw_instruction(c, 3, "Design", "Editor und Vorschau wechseln sofort.", 758, 201, 140)
    draw_instruction(c, 4, "Ort wählen", "Karte oder Liste anklicken.", 758, 125, 140)
    draw_footer(c, 6)
    c.showPage()


def add_workflow_page(c, editor):
    page_background(c)
    draw_page_header(c, "06 · Inhalte pflegen", "In sechs Schritten zum fertigen Ort")
    editor_sidebar = cropped_reader(editor, (1505, 50, 1935, 1088))
    draw_browser(c, editor_sidebar, 54, 78, 282, 350, label="Editor · Ortsliste und Seitenleiste")
    steps = [
        (1, "Editor öffnen", "Die Adresse endet auf /admin.html. Danach mit dem freigeschalteten Google-Konto anmelden."),
        (2, "Ort auswählen", "Schild auf der Karte oder Name in der Liste anklicken."),
        (3, "Ändern", "Titel, Text, Position, Sichtbarkeit oder Reihenfolge bearbeiten. Speichern läuft automatisch."),
        (4, "Fotos", "Hochladen oder aus der Bibliothek wählen. Duplikate werden nicht noch einmal angelegt."),
        (5, "End-Ansicht", "Desktop oder Mobile prüfen. Texte lassen sich dort ebenfalls direkt ändern."),
        (6, "Veröffentlichen", "Neue Orte starten unsichtbar. Erst nach der Prüfung den Haken bei Sichtbar setzen."),
    ]
    positions = [(370, 405), (640, 405), (370, 296), (640, 296), (370, 187), (640, 187)]
    for (number, title, body), (x, y) in zip(steps, positions):
        c.setFillColor(Color(1, 1, 1, alpha=.48))
        c.setStrokeColor(PAPER_EDGE)
        c.roundRect(x, y - 72, 244, 90, 7, stroke=1, fill=1)
        draw_instruction(c, number, title, body, x + 12, y - 4, 220)
    c.setFillColor(PAPER_PALE)
    c.setStrokeColor(PAPER_EDGE)
    c.roundRect(370, 78, 514, 54, 7, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(388, 108, "Fotos bleiben in der Bibliothek")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawString(388, 91, "Aus einem Ort entfernen löscht nicht die gemeinsame Datei.")
    draw_footer(c, 7)
    c.showPage()


def add_links_page(c, desktop):
    page_background(c)
    draw_page_header(c, "07 · Links", "Website öffnen oder bearbeiten",
                     "Beide Bereiche liegen unter derselben Adresse.")
    draw_browser(c, desktop, 530, 82, 376, 356, label="PAASLEBEN")

    for y, title, url, note in (
        (286, "Website", LIVE_URL, "Für Besucher. Kein Login nötig."),
        (154, "Editor", EDITOR_URL, "Anmelden und Inhalte, Fotos, Orte oder Design pflegen."),
    ):
        c.setFillColor(PAPER_PALE)
        c.setStrokeColor(PAPER_EDGE)
        c.roundRect(54, y, 420, 104, 8, stroke=1, fill=1)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(72, y + 73, title)
        c.setFillColor(RED)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(72, y + 49, url)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(72, y + 27, note)
        c.linkURL(url, (66, y + 37, 458, y + 65), relative=0)

    c.setFillColor(GREEN)
    c.roundRect(54, 82, 420, 46, 6, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica", 9.2)
    c.drawString(72, 100, "Ansehen: paasleben.com/    ·    Bearbeiten: /admin.html")
    draw_footer(c, 8)
    c.showPage()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(SOURCE_DECK) as source:
        desktop = image_reader(media(source, "image.jpeg"))
        detail = image_reader(media(source, "image7.jpeg"))
        editor_bytes = media(source, "image11.jpeg")
        editor = image_reader(editor_bytes)
        mobile_bytes = media(source, "image8.jpeg")
        mobile = cropped_reader(mobile_bytes, (34, 142, 466, 1015))
        phone_frame = ImageReader(str(PHONE_FRAME))
        coaching_reference = ImageReader(str(COACHING_REFERENCE))

        c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
        c.setTitle("Paasleben - Kurzanleitung für Website und Editor")
        c.setAuthor("")
        add_cover(c, desktop)
        add_desktop_page(c, desktop)
        add_detail_page(c, detail)
        add_mobile_page(c, mobile, phone_frame)
        add_design_page(c, desktop, coaching_reference)
        add_editor_page(c, editor)
        add_workflow_page(c, editor_bytes)
        add_links_page(c, desktop)
        c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
