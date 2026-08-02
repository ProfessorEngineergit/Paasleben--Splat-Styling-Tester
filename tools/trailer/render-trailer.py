#!/usr/bin/env python3
"""Render the Paasleben app trailer from real browser captures.

The renderer is deliberately deterministic: every motion cue is generated at
the final frame rate, while ffmpeg only encodes the resulting RGB frames.
"""

from __future__ import annotations

import argparse
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path(__file__).resolve().parent / "assets"
CAPTURES = Path(__file__).resolve().parent / "captures"
OUTPUT = ROOT / "output" / "trailer"

PAPER = (244, 236, 216)
PAPER_PALE = (250, 245, 230)
INK = (26, 24, 20)
MUTED = (107, 95, 78)
RED = (184, 52, 47)
GREEN = (36, 70, 59)
WHITE = (255, 255, 255)

SERIF = str(ASSETS / "CormorantGaramond.ttf")
SANS = "/System/Library/Fonts/Avenir.ttc"
SANS_CONDENSED = "/System/Library/Fonts/Avenir Next Condensed.ttc"

DURATION = 17.0


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def span(t: float, start: float, end: float) -> float:
    return clamp((t - start) / (end - start))


def ease(p: float) -> float:
    """Quintic ease-in/out."""
    p = clamp(p)
    if p < 0.5:
        return 16 * p**5
    return 1 - (-2 * p + 2) ** 5 / 2


def ease_out(p: float) -> float:
    return 1 - (1 - clamp(p)) ** 5


def spring(p: float) -> float:
    """Short, damped overshoot for falling UI controls."""
    p = clamp(p)
    if p >= 1:
        return 1.0
    return 1 - math.exp(-7.5 * p) * math.cos(11.5 * p)


def lerp(a: float, b: float, p: float) -> float:
    return a + (b - a) * p


def alpha(image: Image.Image, opacity: float) -> Image.Image:
    if opacity >= 0.999:
        return image
    out = image.copy()
    out.putalpha(out.getchannel("A").point(lambda value: int(value * clamp(opacity))))
    return out


def font(path: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, max(1, round(size)))


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    scale = max(tw / image.width, th / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def composite_device(frame_path: Path, capture_path: Path, screen_rect: tuple[int, int, int, int], radius: int) -> Image.Image:
    chassis = Image.open(frame_path).convert("RGBA")
    shot = Image.open(capture_path).convert("RGB")
    x0, y0, x1, y1 = screen_rect
    screen = cover(shot, (x1 - x0, y1 - y0)).convert("RGBA")
    mask = rounded_mask(screen.size, radius)
    result = Image.new("RGBA", chassis.size, (0, 0, 0, 0))
    result.paste(screen, (x0, y0), mask)
    result.alpha_composite(chassis)
    return result


def place(canvas: Image.Image, layer: Image.Image, center: tuple[float, float], scale: float = 1.0,
          opacity: float = 1.0, rotation: float = 0.0) -> tuple[int, int, int, int]:
    width = max(1, round(layer.width * scale))
    height = max(1, round(layer.height * scale))
    transformed = layer.resize((width, height), Image.Resampling.BICUBIC)
    if rotation:
        transformed = transformed.rotate(rotation, Image.Resampling.BICUBIC, expand=True)
    if opacity < 0.999:
        transformed = alpha(transformed, opacity)
    x = round(center[0] - transformed.width / 2)
    y = round(center[1] - transformed.height / 2)
    canvas.alpha_composite(transformed, (x, y))
    return (x, y, x + transformed.width, y + transformed.height)


def draw_soft_ellipse(canvas: Image.Image, box: tuple[float, float, float, float], opacity: int = 34) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = map(round, box)
    d.ellipse((x0, y0, x1, y1), fill=(16, 16, 14, opacity))
    layer = layer.filter(ImageFilter.GaussianBlur(max(5, round((x1 - x0) * 0.035))))
    canvas.alpha_composite(layer)


def text_layer(text: str, text_font: ImageFont.FreeTypeFont, color: tuple[int, int, int],
               padding: int = 10, spacing: int = 4, align: str = "left") -> Image.Image:
    probe = Image.new("RGBA", (10, 10))
    bbox = ImageDraw.Draw(probe).multiline_textbbox((0, 0), text, font=text_font, spacing=spacing, align=align)
    width = bbox[2] - bbox[0] + padding * 2
    height = bbox[3] - bbox[1] + padding * 2
    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(result).multiline_text(
        (padding - bbox[0], padding - bbox[1]), text, font=text_font,
        fill=(*color, 255), spacing=spacing, align=align,
    )
    return result


def letter_reveal(text: str, text_font: ImageFont.FreeTypeFont, color: tuple[int, int, int],
                  progress: float, tracking: int) -> Image.Image:
    widths = [ImageDraw.Draw(Image.new("L", (1, 1))).textlength(char, font=text_font) for char in text]
    width = round(sum(widths) + tracking * max(0, len(text) - 1) + 30)
    height = round(text_font.size * 1.6)
    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = 15.0
    baseline = round(text_font.size * 1.12)
    count = max(1, len(text))
    for index, (char, char_width) in enumerate(zip(text, widths)):
        local = ease(span(progress, index / count * 0.7, index / count * 0.7 + 0.3))
        char_layer = Image.new("RGBA", result.size, (0, 0, 0, 0))
        y = baseline + round((1 - local) * text_font.size * 0.34)
        ImageDraw.Draw(char_layer).text(
            (round(x), y), char, font=text_font, anchor="ls",
            fill=(*color, round(255 * local)),
        )
        result.alpha_composite(char_layer)
        x += char_width + tracking
    return result


def chip(text: str, scale: float, dark: bool = False, icon: str | None = None) -> Image.Image:
    f = font(SANS, 17 * scale)
    label = text.upper()
    dummy = ImageDraw.Draw(Image.new("L", (1, 1)))
    label_w = dummy.textlength(label, font=f)
    height = round(54 * scale)
    icon_width = round(24 * scale) if icon else 0
    width = round(label_w + 48 * scale + icon_width)
    layer = Image.new("RGBA", (width + round(20 * scale), height + round(22 * scale)), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    shadow = (10, 10, 8, 30)
    d.rounded_rectangle(
        (round(8 * scale), round(10 * scale), width + round(8 * scale), height + round(10 * scale)),
        radius=height // 2, fill=shadow,
    )
    fill = INK if dark else PAPER_PALE
    fg = PAPER_PALE if dark else INK
    d.rounded_rectangle((0, 0, width, height), radius=height // 2, fill=(*fill, 255), outline=(*MUTED, 45), width=max(1, round(scale)))
    x = round(23 * scale)
    if icon:
        r = round(7 * scale)
        d.ellipse((x, height // 2 - r, x + 2 * r, height // 2 + r), outline=(*fg, 230), width=max(1, round(1.4 * scale)))
        if icon == "arrow":
            d.line((x + r - 2 * scale, height // 2, x + r + 3 * scale, height // 2), fill=(*fg, 230), width=max(1, round(1.3 * scale)))
        x += icon_width
    d.text((x, height / 2), label, font=f, fill=(*fg, 255), anchor="lm")
    return layer


def draw_swoosh(canvas: Image.Image, progress: float, width_scale: float) -> None:
    p = ease_out(progress)
    if p <= 0 or progress >= 1:
        return
    w, h = canvas.size
    points = []
    total = 90
    for i in range(round(total * p) + 1):
        u = i / total
        x0, y0 = w * .57, h * .62
        x1, y1 = w * .73, h * .50
        x2, y2 = w * .69, h * .27
        x3, y3 = w * .91, h * .21
        x = (1-u)**3*x0 + 3*(1-u)**2*u*x1 + 3*(1-u)*u*u*x2 + u**3*x3
        y = (1-u)**3*y0 + 3*(1-u)**2*u*y1 + 3*(1-u)*u*u*y2 + u**3*y3
        points.append((round(x), round(y)))
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if len(points) > 1:
        d.line(points, fill=(*RED, 52), width=max(3, round(11 * width_scale)), joint="curve")
        d.line(points, fill=(*RED, 235), width=max(2, round(3 * width_scale)), joint="curve")
        x, y = points[-1]
        r = max(4, round(7 * width_scale))
        d.ellipse((x-r, y-r, x+r, y+r), fill=(*RED, 255))
    canvas.alpha_composite(layer)


class Trailer:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.s = width / 1920

        self.mac_map = composite_device(
            ASSETS / "macbook-frame.png", CAPTURES / "desktop-map.png",
            (118, 30, 998, 616), 9,
        )
        self.mac_top = composite_device(
            ASSETS / "macbook-frame.png", CAPTURES / "desktop-top-view.png",
            (118, 30, 998, 616), 9,
        )
        self.mac_detail = composite_device(
            ASSETS / "macbook-frame.png", CAPTURES / "desktop-detail.png",
            (118, 30, 998, 616), 9,
        )
        self.phone_map = composite_device(
            ASSETS / "iphone-frame.png", CAPTURES / "mobile-map.png",
            (32, 28, 431, 892), 34,
        )
        self.phone_detail = composite_device(
            ASSETS / "iphone-frame.png", CAPTURES / "mobile-detail.png",
            (32, 28, 431, 892), 34,
        )
        self.phone_content = composite_device(
            ASSETS / "iphone-frame.png", CAPTURES / "mobile-content.png",
            (32, 28, 431, 892), 34,
        )

        self.title_font = font(SERIF, 132 * self.s)
        self.hero_font = font(SERIF, 70 * self.s)
        self.mobile_font = font(SERIF, 78 * self.s)
        self.small_font = font(SANS, 19 * self.s)
        self.url_font = font(SANS, 28 * self.s)

        self.title_layer = letter_reveal("Paasleben", self.title_font, INK, 1.0, round(1.5 * self.s))
        self.desktop_copy = text_layer("Das Areal.\nAus jeder Perspektive.", self.hero_font, INK, spacing=round(8 * self.s))
        self.detail_copy = text_layer("Orte öffnen.\nGeschichten entdecken.", self.hero_font, INK, spacing=round(8 * self.s))
        self.mobile_copy = text_layer("Angepasstes\nMobile UI", self.mobile_font, INK, spacing=round(8 * self.s))
        self.eyebrow = text_layer("COACHING CAMPUS  ·  PAASLEBEN", self.small_font, MUTED)
        self.url = text_layer("paasleben.com", self.url_font, PAPER_PALE)
        self.chip_top = chip("Draufsicht", self.s, icon="arrow")
        self.chip_open = chip("Ort öffnen", self.s, dark=True, icon="arrow")
        self.chip_touch = chip("Mit einem Finger", self.s, icon="arrow")
        self.chip_switch = chip("Direkt wechseln", self.s, dark=True, icon="arrow")
        self.background = self.make_background()
        self.final_background = self.make_final_background()
        self.grain = self.make_grain()

    def make_background(self) -> Image.Image:
        image = Image.new("RGBA", (self.width, self.height), (*PAPER, 255))
        d = ImageDraw.Draw(image)
        d.ellipse(
            (-self.width * .20, self.height * .56, self.width * .72, self.height * 1.55),
            fill=(218, 226, 199, 54),
        )
        return image.filter(ImageFilter.GaussianBlur(round(90 * self.s)))

    def make_final_background(self) -> Image.Image:
        y = np.linspace(0, 1, self.height)[:, None, None]
        top = np.array(PAPER, dtype=np.float32)[None, None, :]
        bottom = np.array((177, 214, 211), dtype=np.float32)[None, None, :]
        rgb = top * (1 - y) + bottom * y
        rgb = np.repeat(rgb, self.width, axis=1).astype(np.uint8)
        return Image.fromarray(rgb, "RGB").convert("RGBA")

    def make_grain(self) -> Image.Image:
        rng = np.random.default_rng(2046)
        noise = rng.normal(127, 17, (self.height, self.width)).clip(0, 255).astype(np.uint8)
        grain = Image.fromarray(noise, "L")
        result = Image.new("RGBA", (self.width, self.height), (255, 255, 255, 0))
        result.putalpha(grain.point(lambda v: max(0, min(7, abs(v - 127) // 3))))
        return result

    def device_crossfade(self, canvas: Image.Image, first: Image.Image, second: Image.Image,
                         p: float, center: tuple[float, float], scale: float,
                         opacity: float = 1.0) -> None:
        if p <= 0:
            place(canvas, first, center, scale, opacity)
        elif p >= 1:
            place(canvas, second, center, scale, opacity)
        else:
            place(canvas, first, center, scale, opacity * (1 - ease(p)))
            place(canvas, second, center, scale, opacity * ease(p))

    def render(self, t: float) -> Image.Image:
        canvas = self.background.copy()
        s = self.s

        # 1. Wordmark: a restrained type build, then the underline becomes the
        # visual hand-off into the desktop device.
        title_out = 1 - ease(span(t, 1.75, 2.45))
        if title_out > 0:
            eyebrow_p = ease(span(t, .18, .85))
            place(canvas, self.eyebrow, (self.width / 2, self.height * .39), 1, eyebrow_p * title_out)
            word_p = span(t, .35, 1.55)
            word = letter_reveal("Paasleben", self.title_font, INK, word_p, round(1.5 * s))
            title_y = lerp(self.height * .55, self.height * .53, ease(word_p))
            place(canvas, word, (self.width / 2, title_y), 1, title_out)
            line_p = ease(span(t, .85, 1.65))
            line_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(line_layer)
            line_w = round(240 * s * line_p)
            y = round(self.height * .625)
            d.line((self.width // 2 - line_w // 2, y, self.width // 2 + line_w // 2, y), fill=(*RED, round(255 * title_out)), width=max(2, round(3 * s)))
            canvas.alpha_composite(line_layer)

        # 2. Desktop zoom-out. The opening is intentionally oversized so the
        # first read is the website itself, not the hardware frame.
        desktop_p = ease(span(t, 1.72, 3.18))
        desktop_out = 1 - ease(span(t, 6.48, 7.22))
        if desktop_p > 0 and desktop_out > 0:
            mac_center = (
                lerp(self.width * .55, self.width * .64, desktop_p),
                lerp(self.height * .67, self.height * .57, desktop_p),
            )
            mac_scale = lerp(1.72 * s, 1.03 * s, desktop_p)
            top_mix = span(t, 4.15, 4.82)
            detail_mix = span(t, 5.22, 5.92)
            if detail_mix > 0:
                self.device_crossfade(canvas, self.mac_top, self.mac_detail, detail_mix, mac_center, mac_scale, desktop_out)
            else:
                self.device_crossfade(canvas, self.mac_map, self.mac_top, top_mix, mac_center, mac_scale, desktop_out)

            copy_in = ease(span(t, 2.72, 3.55))
            copy_out = 1 - ease(span(t, 4.72, 5.22))
            copy_x = lerp(-260 * s, 300 * s, copy_in)
            place(canvas, self.desktop_copy, (copy_x, self.height * .42), 1, copy_in * copy_out * desktop_out)

            # Draufsicht control falls, settles, then triggers the state change.
            p = span(t, 3.55, 4.32)
            if 0 < p < 1 or (p >= 1 and t < 5.08):
                settle = spring(p)
                y = lerp(-90 * s, 172 * s, settle)
                place(canvas, self.chip_top, (self.width * .78, y), 1, min(1, p * 3) * desktop_out, rotation=lerp(-5, 0, ease(p)))

            # Location interaction: a precise ripple inside the screen.
            ripple = span(t, 5.0, 5.58)
            if 0 < ripple < 1:
                overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                d = ImageDraw.Draw(overlay)
                cx, cy = self.width * .65, self.height * .58
                radius = lerp(8 * s, 84 * s, ease_out(ripple))
                opacity = round(220 * (1 - ripple))
                d.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), outline=(*RED, opacity), width=max(2, round(3 * s)))
                d.ellipse((cx-6*s, cy-6*s, cx+6*s, cy+6*s), fill=(*RED, round(255 * (1-ripple))))
                canvas.alpha_composite(overlay)

            detail_in = ease(span(t, 5.45, 6.08))
            place(canvas, self.detail_copy, (315 * s, self.height * .48), 1, detail_in * desktop_out)
            p_open = span(t, 5.72, 6.34)
            if p_open > 0:
                settle = spring(p_open)
                place(canvas, self.chip_open, (315 * s, lerp(self.height + 90*s, self.height * .73, settle)), 1, min(1, p_open * 3) * desktop_out)

        # Directed hand-off. It is visible over both scenes and gives the eye
        # one clear path instead of a generic crossfade.
        draw_swoosh(canvas, span(t, 6.48, 7.32), s)

        # 3. Mobile UI: phone arrives from the swoosh endpoint. Real mobile
        # captures are crossfaded only after the device has settled.
        mobile_p = ease(span(t, 6.82, 7.88))
        mobile_out = 1 - ease(span(t, 12.0, 12.68))
        if mobile_p > 0 and mobile_out > 0:
            phone_center = (
                lerp(self.width * 1.12, self.width * .73, mobile_p),
                lerp(self.height * .32, self.height * .54, mobile_p),
            )
            phone_scale = lerp(.54 * s, .83 * s, spring(mobile_p))
            detail_mix = span(t, 9.15, 9.8)
            content_mix = span(t, 10.58, 11.22)
            if content_mix > 0:
                self.device_crossfade(canvas, self.phone_detail, self.phone_content, content_mix, phone_center, phone_scale, mobile_out)
            elif detail_mix > 0:
                self.device_crossfade(canvas, self.phone_map, self.phone_detail, detail_mix, phone_center, phone_scale, mobile_out)
            else:
                place(canvas, self.phone_map, phone_center, phone_scale, mobile_out)

            copy_move = ease_out(span(t, 7.02, 7.82))
            copy_in = ease(span(t, 7.12, 7.68))
            copy_x = lerp(-360 * s, 380 * s, copy_move)
            place(canvas, self.mobile_copy, (copy_x, self.height * .43), 1, copy_in * mobile_out)

            p_touch = span(t, 8.0, 8.7)
            if p_touch > 0 and t < 10.0:
                place(canvas, self.chip_touch, (355 * s, lerp(-90*s, self.height * .69, spring(p_touch))), 1, min(1, p_touch*3) * mobile_out)
            p_switch = span(t, 9.25, 9.95)
            if p_switch > 0 and t < 11.35:
                place(canvas, self.chip_switch, (430 * s, lerp(self.height+90*s, self.height * .79, spring(p_switch))), 1, min(1, p_switch*3) * mobile_out)

        # 4. Device family finale. The background shifts toward the cool lower
        # field in the supplied composition reference, but stays in Paasleben's
        # paper/green palette.
        final_p = ease(span(t, 12.0, 13.0))
        if final_p > 0:
            canvas = Image.blend(canvas, self.final_background, final_p)
            mac_p = spring(span(t, 12.05, 13.38))
            phone_p = spring(span(t, 12.36, 13.65))
            mac_center = (lerp(-420*s, 820*s, mac_p), lerp(self.height*.66, self.height*.59, mac_p))
            phone_center = (lerp(self.width+260*s, 1444*s, phone_p), lerp(self.height*.72, self.height*.61, phone_p))
            mac_scale = lerp(.68*s, .91*s, mac_p)
            phone_scale = lerp(.58*s, .73*s, phone_p)
            draw_soft_ellipse(canvas, (330*s, 875*s, 1510*s, 1040*s), round(32 * final_p))
            place(canvas, self.mac_map, mac_center, mac_scale, final_p)
            place(canvas, self.phone_detail, phone_center, phone_scale, final_p)

            brand_in = ease(span(t, 13.12, 14.0))
            brand = letter_reveal("Paasleben", font(SERIF, 106*s), INK, brand_in, round(1.0*s))
            place(canvas, brand, (self.width/2, 111*s), 1, brand_in)
            eyebrow = text_layer("DESKTOP  ·  MOBIL", font(SANS, 17*s), MUTED)
            place(canvas, eyebrow, (self.width/2, 188*s), 1, brand_in)

            url_p = span(t, 14.18, 15.08)
            if url_p > 0:
                settle = spring(url_p)
                pill_w, pill_h = round(340*s), round(68*s)
                pill = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
                d = ImageDraw.Draw(pill)
                d.rounded_rectangle((0, 0, pill_w-1, pill_h-1), radius=pill_h//2, fill=(*GREEN, 255))
                url_x = (pill_w - self.url.width) // 2
                url_y = (pill_h - self.url.height) // 2
                pill.alpha_composite(self.url, (url_x, url_y))
                place(canvas, pill, (self.width/2, lerp(self.height+80*s, self.height-64*s, settle)), 1, min(1, url_p*3))

        canvas.alpha_composite(self.grain)
        return canvas.convert("RGB")


def encode(trailer: Trailer, path: Path, fps: int, preset: str, crf: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg", "-y", "-loglevel", "warning",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{trailer.width}x{trailer.height}", "-r", str(fps), "-i", "-",
        "-an", "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    frames = round(DURATION * fps)
    for index in range(frames):
        frame = trailer.render(index / fps)
        process.stdin.write(frame.tobytes())
        if index % max(1, fps) == 0:
            print(f"frame {index}/{frames}", flush=True)
    process.stdin.close()
    result = process.wait()
    if result:
        raise SystemExit(result)


def render_stills(trailer: Trailer, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for value in (0.8, 2.7, 4.4, 5.8, 7.7, 9.7, 11.0, 13.2, 14.6, 16.3):
        trailer.render(value).save(directory / f"frame-{value:04.1f}.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", action="store_true", help="960×540 at 30 fps")
    parser.add_argument("--stills", action="store_true", help="render keyframes only")
    args = parser.parse_args()
    if args.draft:
        width, height, fps = 960, 540, 30
        output = OUTPUT / "Paasleben-Trailer-Draft.mp4"
    else:
        width, height, fps = 1920, 1080, 60
        output = OUTPUT / "Paasleben-Trailer.mp4"
    trailer = Trailer(width, height)
    if args.stills:
        render_stills(trailer, OUTPUT / ("stills-draft" if args.draft else "stills"))
        return
    encode(trailer, output, fps, "veryfast" if args.draft else "slow", 19 if args.draft else 16)
    print(output)


if __name__ == "__main__":
    main()
