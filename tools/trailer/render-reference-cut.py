#!/usr/bin/env python3
"""Render the short Paasleben trailer in the motion language of the supplied reference.

The cut uses real Paasleben UI captures, not invented product screens.  It is
designed as a dense app trailer: macro UI crop, rapid camera pull-back, short
type cards, a mobile UI build, and a compact desktop/mobile end frame.
"""

from __future__ import annotations

import argparse
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CAPTURES = HERE / "captures"
ASSETS = HERE / "assets"
OUTPUT = ROOT / "output" / "trailer"

SERIF = str(ASSETS / "CormorantGaramond.ttf")
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
SANS_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

INK = (24, 22, 20)
PAPER = (252, 249, 242)
RED = (191, 52, 48)
GREEN = (40, 76, 63)
MUTED = (111, 103, 91)

DURATION = 9.2


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def span(t: float, start: float, end: float) -> float:
    return clamp((t - start) / (end - start))


def ease(p: float) -> float:
    p = clamp(p)
    return p * p * (3 - 2 * p)


def ease_out(p: float) -> float:
    p = clamp(p)
    return 1 - (1 - p) ** 4


def ease_in(p: float) -> float:
    return clamp(p) ** 4


def spring(p: float) -> float:
    p = clamp(p)
    if p >= 1:
        return 1.0
    return 1 - math.exp(-8.2 * p) * math.cos(12.0 * p)


def lerp(a: float, b: float, p: float) -> float:
    return a + (b - a) * p


def font(path: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, max(1, round(size)))


def opacity(image: Image.Image, value: float) -> Image.Image:
    if value >= .999:
        return image
    out = image.copy()
    out.putalpha(out.getchannel("A").point(lambda pixel: round(pixel * clamp(value))))
    return out


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255,
    )
    return mask


def rounded_screen(path: Path, width: int, radius: int, border: int = 0) -> Image.Image:
    source = Image.open(path).convert("RGB")
    height = round(width * source.height / source.width)
    source = source.resize((width, height), Image.Resampling.LANCZOS).convert("RGBA")
    if border <= 0:
        source.putalpha(rounded_mask(source.size, radius))
        return source
    result = Image.new("RGBA", (width + border * 2, height + border * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(result)
    draw.rounded_rectangle(
        (0, 0, result.width - 1, result.height - 1),
        radius=radius + border, fill=(25, 24, 22, 255),
    )
    result.paste(source, (border, border), rounded_mask(source.size, radius))
    return result


def shadowed(layer: Image.Image, padding: int, blur: int, alpha_value: int = 65) -> Image.Image:
    result = Image.new(
        "RGBA", (layer.width + padding * 2, layer.height + padding * 2), (0, 0, 0, 0),
    )
    shadow = Image.new("RGBA", result.size, (0, 0, 0, 0))
    mask = layer.getchannel("A")
    colored = Image.new("RGBA", layer.size, (18, 18, 16, alpha_value))
    colored.putalpha(mask.point(lambda px: round(px * alpha_value / 255)))
    shadow.alpha_composite(colored, (padding, padding + max(2, padding // 7)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    result.alpha_composite(shadow)
    result.alpha_composite(layer, (padding, padding))
    return result


def place(
    canvas: Image.Image,
    layer: Image.Image,
    center: tuple[float, float],
    scale: float = 1.0,
    alpha_value: float = 1.0,
    rotation: float = 0.0,
) -> tuple[int, int, int, int]:
    width = max(1, round(layer.width * scale))
    height = max(1, round(layer.height * scale))
    item = layer.resize((width, height), Image.Resampling.BICUBIC)
    if rotation:
        item = item.rotate(rotation, Image.Resampling.BICUBIC, expand=True)
    if alpha_value < .999:
        item = opacity(item, alpha_value)
    x = round(center[0] - item.width / 2)
    y = round(center[1] - item.height / 2)
    canvas.alpha_composite(item, (x, y))
    return x, y, x + item.width, y + item.height


def text_image(
    text: str,
    text_font: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
    padding: int = 18,
    spacing: int = 8,
    align: str = "left",
) -> Image.Image:
    probe = Image.new("L", (8, 8))
    bbox = ImageDraw.Draw(probe).multiline_textbbox(
        (0, 0), text, font=text_font, spacing=spacing, align=align,
    )
    result = Image.new(
        "RGBA", (
            round(bbox[2] - bbox[0] + padding * 2),
            round(bbox[3] - bbox[1] + padding * 2),
        ),
        (0, 0, 0, 0),
    )
    ImageDraw.Draw(result).multiline_text(
        (padding - bbox[0], padding - bbox[1]), text, font=text_font,
        fill=(*color, 255), spacing=spacing, align=align,
    )
    return result


def tracking_text(
    text: str,
    text_font: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
    tracking: float,
) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    widths = [probe.textlength(character, font=text_font) for character in text]
    width = round(sum(widths) + tracking * max(0, len(text) - 1) + 20)
    result = Image.new("RGBA", (width, round(text_font.size * 1.5)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(result)
    x = 10.0
    baseline = round(text_font.size * 1.08)
    for character, character_width in zip(text, widths):
        draw.text((round(x), baseline), character, font=text_font, anchor="ls", fill=(*color, 255))
        x += character_width + tracking
    return result


def wordmark_reveal(text: str, text_font: ImageFont.FreeTypeFont, progress: float) -> Image.Image:
    complete = tracking_text(text, text_font, INK, text_font.size * .012)
    reveal = round(complete.width * ease_out(progress))
    result = Image.new("RGBA", complete.size, (0, 0, 0, 0))
    if reveal > 0:
        cropped = complete.crop((0, 0, reveal, complete.height))
        result.alpha_composite(cropped)
        edge = Image.new("RGBA", result.size, (0, 0, 0, 0))
        x = max(0, reveal - round(text_font.size * .10))
        ImageDraw.Draw(edge).rectangle((x, 0, reveal, result.height), fill=(255, 255, 255, 55))
    return result


def pill(
    label: str,
    scale: float,
    dark: bool = False,
    dot: bool = False,
) -> Image.Image:
    f = font(SANS_BOLD, 21 * scale)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    label_width = probe.textlength(label.upper(), font=f)
    height = round(62 * scale)
    width = round(label_width + (78 if dot else 56) * scale)
    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(result)
    fill = INK if dark else (255, 253, 247)
    foreground = (255, 253, 247) if dark else INK
    draw.rounded_rectangle(
        (1, 1, width - 2, height - 2), radius=height // 2,
        fill=(*fill, 255), outline=(*MUTED, 65), width=max(1, round(1.5 * scale)),
    )
    x = round(27 * scale)
    if dot:
        radius = round(7 * scale)
        draw.ellipse((x, height // 2 - radius, x + radius * 2, height // 2 + radius), fill=(*RED, 255))
        x += round(25 * scale)
    draw.text((x, height / 2), label.upper(), font=f, anchor="lm", fill=(*foreground, 255))
    return result


def camera_view(board: Image.Image, zoom: float, focus: tuple[float, float]) -> Image.Image:
    zoom = max(1.0, zoom)
    crop_width = max(2, round(board.width / zoom))
    crop_height = max(2, round(board.height / zoom))
    left = round(clamp(focus[0] - crop_width / 2, 0, board.width - crop_width))
    top = round(clamp(focus[1] - crop_height / 2, 0, board.height - crop_height))
    crop = board.crop((left, top, left + crop_width, top + crop_height))
    return crop.resize(board.size, Image.Resampling.LANCZOS)


def over(base: Image.Image, layer: Image.Image, amount: float) -> None:
    if amount > 0:
        base.alpha_composite(opacity(layer, amount))


class ReferenceCut:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.s = width / 2560

        desktop_width = round(1900 * self.s)
        phone_width = round(600 * self.s)
        self.desktop_map = shadowed(
            rounded_screen(CAPTURES / "desktop-map.png", desktop_width, round(30 * self.s)),
            round(60 * self.s), round(30 * self.s), 68,
        )
        self.desktop_top = shadowed(
            rounded_screen(CAPTURES / "desktop-top-view.png", desktop_width, round(30 * self.s)),
            round(60 * self.s), round(30 * self.s), 68,
        )
        self.phone_map = shadowed(
            rounded_screen(CAPTURES / "mobile-map.png", phone_width, round(72 * self.s), round(7 * self.s)),
            round(54 * self.s), round(28 * self.s), 72,
        )
        self.phone_detail = shadowed(
            rounded_screen(CAPTURES / "mobile-detail.png", phone_width, round(72 * self.s), round(7 * self.s)),
            round(54 * self.s), round(28 * self.s), 72,
        )
        self.phone_content = shadowed(
            rounded_screen(CAPTURES / "mobile-content.png", phone_width, round(72 * self.s), round(7 * self.s)),
            round(54 * self.s), round(28 * self.s), 72,
        )

        self.logo_large = tracking_text("Paasleben", font(SERIF, 210 * self.s), INK, 1.5 * self.s)
        self.logo_final = tracking_text("Paasleben", font(SERIF, 128 * self.s), INK, 1.0 * self.s)
        self.desktop_headline = text_image(
            "Das Areal.\nAus jeder Perspektive.", font(SANS_BOLD, 84 * self.s), INK,
            spacing=round(10 * self.s), align="center",
        )
        self.mobile_headline = text_image(
            "Angepasstes\nMobile UI", font(SANS_BOLD, 79 * self.s), INK,
            spacing=round(8 * self.s),
        )
        self.everywhere_headline = text_image(
            "Ein Ort.\nAuf jedem Bildschirm.", font(SANS_BOLD, 91 * self.s), INK,
            spacing=round(9 * self.s), align="center",
        )
        self.eyebrow = tracking_text(
            "COACHING CAMPUS  ·  PAASLEBEN", font(SANS, 22 * self.s), MUTED, 1.5 * self.s,
        )
        self.url_text = tracking_text(
            "paasleben.com", font(SANS_BOLD, 28 * self.s), (255, 253, 247), .8 * self.s,
        )
        self.controls = [
            pill("Ton", self.s, dot=True),
            pill("Draufsicht", self.s),
            pill("Bedienen", self.s),
        ]
        self.location_one = pill("Pferde-Stall", self.s, dark=True, dot=True)
        self.location_two = pill("Willkommen", self.s, dot=True)
        self.switch_chip = pill("Direkt wechseln", self.s, dark=True, dot=True)
        self.grain = self.make_grain()

    def make_grain(self) -> Image.Image:
        rng = np.random.default_rng(3817)
        noise = rng.normal(127, 16, (self.height, self.width)).clip(0, 255).astype(np.uint8)
        alpha_channel = Image.fromarray(noise, "L").point(lambda value: min(7, abs(value - 127) // 3))
        result = Image.new("RGBA", (self.width, self.height), (255, 255, 255, 0))
        result.putalpha(alpha_channel)
        return result

    def background(self, t: float) -> Image.Image:
        divisor = 4
        width = max(64, self.width // divisor)
        height = max(36, self.height // divisor)
        image = Image.new("RGBA", (width, height), (*PAPER, 255))
        draw = ImageDraw.Draw(image)
        phase = t * .52
        blobs = (
            (
                width * (.10 + .10 * math.sin(phase)), height * (.08 + .12 * math.cos(phase * .9)),
                width * .62, height * .72, (240, 160, 146, 96),
            ),
            (
                width * (.48 + .08 * math.cos(phase * .7)), height * (.18 + .12 * math.sin(phase * 1.1)),
                width * .58, height * .68, (183, 205, 176, 104),
            ),
            (
                width * (.26 + .12 * math.sin(phase * .6 + 2)), height * (.56 + .08 * math.cos(phase)),
                width * .54, height * .58, (174, 207, 217, 90),
            ),
        )
        for x, y, blob_width, blob_height, color in blobs:
            draw.ellipse((x, y, x + blob_width, y + blob_height), fill=color)
        image = image.filter(ImageFilter.GaussianBlur(round(62 * self.s + 24)))
        return image.resize((self.width, self.height), Image.Resampling.BICUBIC)

    def opening_logo(self, t: float) -> Image.Image:
        frame = self.background(t)
        reveal = span(t, .06, .48)
        fade = 1 - ease(span(t, .58, .88))
        scale = lerp(1.12, .96, ease_out(span(t, 0, .58)))
        logo = wordmark_reveal("Paasleben", font(SERIF, 210 * self.s), reveal)
        place(frame, self.eyebrow, (self.width / 2, self.height * .39), 1, ease(span(t, .12, .42)) * fade)
        place(frame, logo, (self.width / 2, self.height * .53), scale, fade)
        line = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(line)
        line_progress = ease_out(span(t, .23, .58)) * (1 - ease(span(t, .62, .84)))
        line_width = round(370 * self.s * line_progress)
        y = round(self.height * .64)
        draw.line(
            (self.width / 2 - line_width / 2, y, self.width / 2 + line_width / 2, y),
            fill=(*RED, round(255 * fade)), width=max(2, round(5 * self.s)),
        )
        frame.alpha_composite(line)
        return frame

    def desktop_board(self, t: float) -> Image.Image:
        board = self.background(t)
        center = (self.width * .53, self.height * .54)
        place(board, self.desktop_map, center)

        # Crisp synthetic UI controls enter independently, mirroring the
        # reference's component-by-component app assembly.
        p_controls = span(t, .95, 1.48)
        x_positions = (.70, .815, .925)
        for index, (control, x_position) in enumerate(zip(self.controls, x_positions)):
            local = span(p_controls, index * .12, .68 + index * .10)
            y = lerp(-120 * self.s, self.height * .14, spring(local))
            place(board, control, (self.width * x_position, y), 1, min(1, local * 3))

        p_location = span(t, 1.30, 1.78)
        if p_location > 0:
            place(
                board, self.location_one, (self.width * .59, self.height * .38),
                lerp(.76, 1, spring(p_location)), ease(p_location),
            )
        p_welcome = span(t, 1.56, 2.02)
        if p_welcome > 0:
            place(
                board, self.location_two, (self.width * .68, self.height * .68),
                lerp(.76, 1, spring(p_welcome)), ease(p_welcome),
            )

        pull = ease(span(t, .52, 2.30))
        zoom = lerp(5.7, 1.0, pull)
        focus = (
            lerp(self.width * .19, self.width * .50, pull),
            lerp(self.height * .19, self.height * .50, pull),
        )
        return camera_view(board, zoom, focus)

    def type_card(self, t: float, second: bool = False) -> Image.Image:
        frame = self.background(t)
        if second:
            start, end = 6.10, 6.98
            layer = self.everywhere_headline
            accent_y = self.height * .655
        else:
            start, end = 2.42, 3.36
            layer = self.desktop_headline
            accent_y = self.height * .655
        enter = ease_out(span(t, start, start + .34))
        leave = 1 - ease_in(span(t, end - .22, end))
        amount = enter * leave
        place(
            frame, layer, (self.width / 2, lerp(self.height * .55, self.height * .50, enter)),
            lerp(.93, 1, enter), amount,
        )
        accent = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(accent)
        line_width = round(250 * self.s * ease_out(span(t, start + .12, start + .54)))
        draw.line(
            (self.width / 2 - line_width / 2, accent_y, self.width / 2 + line_width / 2, accent_y),
            fill=(*RED, round(255 * amount)), width=max(2, round(5 * self.s)),
        )
        frame.alpha_composite(accent)
        return frame

    def mobile_board(self, t: float) -> Image.Image:
        board = self.background(t)
        phone_center = (self.width * .72, self.height * .52)

        detail_mix = ease(span(t, 4.78, 5.20))
        if detail_mix < 1:
            place(board, self.phone_map, phone_center, 1, 1 - detail_mix)
        if detail_mix > 0:
            place(board, self.phone_detail, phone_center, 1, detail_mix)

        copy_in = ease_out(span(t, 4.22, 4.72))
        place(
            board, self.mobile_headline,
            (lerp(-410 * self.s, self.width * .265, copy_in), self.height * .42),
            1, ease(span(t, 4.27, 4.67)),
        )

        # A second real screen fans out behind the active one, then settles.
        stack = span(t, 5.30, 5.78)
        if stack > 0:
            place(
                board, self.phone_content,
                (lerp(self.width * .72, self.width * .47, spring(stack)), self.height * .54),
                lerp(.82, .91, spring(stack)), ease(stack), rotation=lerp(0, -4.2, spring(stack)),
            )
            # Keep the active detail surface in front of the fanned card.
            place(board, self.phone_detail, phone_center)

        chip_p = span(t, 5.05, 5.50)
        if chip_p > 0:
            place(
                board, self.switch_chip,
                (self.width * .28, lerp(self.height + 120 * self.s, self.height * .70, spring(chip_p))),
                1, min(1, chip_p * 3),
            )

        pull = ease(span(t, 3.24, 4.48))
        zoom = lerp(4.7, 1.0, pull)
        focus = (
            lerp(self.width * .72, self.width * .53, pull),
            lerp(self.height * .85, self.height * .50, pull),
        )
        return camera_view(board, zoom, focus)

    def finale(self, t: float) -> Image.Image:
        frame = self.background(t)
        desktop_p = spring(span(t, 6.90, 7.58))
        phone_p = spring(span(t, 7.06, 7.70))

        place(
            frame, self.desktop_top,
            (lerp(-650 * self.s, self.width * .43, desktop_p), self.height * .61),
            lerp(.74, .84, desktop_p), min(1, span(t, 6.90, 7.18) * 3),
            rotation=lerp(-3.2, 0, desktop_p),
        )
        place(
            frame, self.phone_detail,
            (lerp(self.width + 350 * self.s, self.width * .78, phone_p), self.height * .61),
            lerp(.72, .80, phone_p), min(1, span(t, 7.06, 7.34) * 3),
            rotation=lerp(4.2, 0, phone_p),
        )

        brand_p = ease_out(span(t, 7.55, 8.02))
        brand_y = lerp(-130 * self.s, self.height * .11, spring(brand_p))
        place(frame, self.logo_final, (self.width / 2, brand_y), 1, brand_p)

        url_p = span(t, 7.92, 8.42)
        if url_p > 0:
            pill_width, pill_height = round(390 * self.s), round(72 * self.s)
            url_pill = Image.new("RGBA", (pill_width, pill_height), (0, 0, 0, 0))
            draw = ImageDraw.Draw(url_pill)
            draw.rounded_rectangle(
                (0, 0, pill_width - 1, pill_height - 1),
                radius=pill_height // 2, fill=(*GREEN, 255),
            )
            url_pill.alpha_composite(
                self.url_text,
                ((pill_width - self.url_text.width) // 2, (pill_height - self.url_text.height) // 2),
            )
            place(
                frame, url_pill,
                (self.width / 2, lerp(self.height + 90 * self.s, self.height * .94, spring(url_p))),
                1, min(1, url_p * 3),
            )
        return frame

    def render(self, t: float) -> Image.Image:
        canvas = self.background(t)

        if t < .90:
            over(canvas, self.opening_logo(t), 1 - ease(span(t, .62, .88)))

        desktop_in = ease_out(span(t, .46, .76))
        desktop_out = 1 - ease(span(t, 2.48, 2.76))
        if desktop_in * desktop_out > 0:
            over(canvas, self.desktop_board(t), desktop_in * desktop_out)

        card_one = ease_out(span(t, 2.46, 2.68)) * (1 - ease(span(t, 3.16, 3.38)))
        if card_one > 0:
            over(canvas, self.type_card(t), card_one)

        mobile_in = ease_out(span(t, 3.18, 3.43))
        mobile_out = 1 - ease(span(t, 5.96, 6.24))
        if mobile_in * mobile_out > 0:
            over(canvas, self.mobile_board(t), mobile_in * mobile_out)

        card_two = ease_out(span(t, 6.02, 6.22)) * (1 - ease(span(t, 6.76, 7.00)))
        if card_two > 0:
            over(canvas, self.type_card(t, second=True), card_two)

        final_in = ease_out(span(t, 6.82, 7.08))
        if final_in > 0:
            over(canvas, self.finale(t), final_in)

        canvas.alpha_composite(self.grain)
        return canvas.convert("RGB")


def encode(cut: ReferenceCut, path: Path, fps: int, draft: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg", "-y", "-loglevel", "warning",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{cut.width}x{cut.height}", "-r", str(fps), "-i", "-",
        "-an", "-c:v", "libx264", "-preset", "veryfast" if draft else "slow",
        "-crf", "19" if draft else "15", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(path),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    total = round(DURATION * fps)
    for index in range(total):
        process.stdin.write(cut.render(index / fps).tobytes())
        if index % fps == 0:
            print(f"frame {index}/{total}", flush=True)
    process.stdin.close()
    result = process.wait()
    if result:
        raise SystemExit(result)


def stills(cut: ReferenceCut, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for t in (.35, .80, 1.30, 2.20, 2.78, 3.50, 4.35, 5.12, 5.72, 6.38, 7.30, 8.15, 8.85):
        cut.render(t).save(directory / f"frame-{t:04.2f}.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", action="store_true")
    parser.add_argument("--stills", action="store_true")
    args = parser.parse_args()
    if args.draft:
        width, height, fps = 1280, 720, 30
        output = OUTPUT / "Paasleben-Trailer-Reference-Cut-Draft.mp4"
    else:
        width, height, fps = 2560, 1440, 60
        output = OUTPUT / "Paasleben-Trailer.mp4"
    cut = ReferenceCut(width, height)
    if args.stills:
        stills(cut, OUTPUT / ("reference-cut-stills-draft" if args.draft else "reference-cut-stills"))
        return
    encode(cut, output, fps, args.draft)
    print(output)


if __name__ == "__main__":
    main()
