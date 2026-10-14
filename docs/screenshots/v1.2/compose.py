"""Composes the 1.2 App Store screenshots.

Each one reuses a 1.1 screenshot as the template — its navy background and
device frame — repaints the headline area from the background's own gradient,
writes the new headline, and drops a fresh simulator capture into the frame's
screen. Captures come from the app's screenshots mode (src/lib/shots.ts),
named <scene>-<lang>.png.

Shots whose screen hasn't changed since the first 1.2 set ('keep') are taken
as they were from git (KEPT_FROM) — their source photos are gone, and nothing
in them is out of date.

Ten each for iPhone and iPad. The 6.3" iPhone set is the 6.5" one scaled to 1206×2622.

    python3 compose.py <captures dir with iphone/ and ipad/> <out dir> <story photo> [en|es]
"""
import io
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
OLD = HERE.parent / 'v1.1'
FONT = '/System/Library/Fonts/SFNS.ttf'

DEVICES = {
    'iphone': {
        'template': OLD / 'iphone_2_border.jpg',
        'header_until': 560,
        'screen': (136, 598, 1149, None),  # left, top, right, bottom (None = bleed off the bottom)
        'radius': 96,
        'title': (104, [201, 318]),
        'subtitle': (40, 452),
    },
    'ipad': {
        'template': OLD / 'ipad_2_border.jpg',
        'header_until': 600,
        'screen': (262, 642, 1802, 2694),
        'radius': 36,
        'title': (124, [247, 398]),
        'subtitle': (50, 528),
    },
}

# (name, source, title, subtitle). source: a scene captured in screenshots
# mode, 'story_result' (drawn here), or ('keep', old file name).
SHOTS = [
    ('1_home', 'home', ['Borders, collages', '& carousels.'], 'No account. No uploads. No watermark.'),
    ('2_edit', 'editPlain', ['Edit, with or', 'without borders.'], 'Light and colour free; curves with Pro'),
    ('3_border', 'caption', ['Clean borders.', 'Your words.'], 'Write under the photo, with Pro'),
    ('4_layouts', ('keep', '8_layouts'), ['A layout for', 'every set.'], 'Grids and creative templates'),
    ('5_carousel', 'carousel', ['Carousels that', 'flow.'], 'One photo per post, cut to line up — free'),
    ('6_retouch', 'retouch', ['Erase what', "doesn't belong."], 'Paint over it and it’s gone, with Pro'),
    ('7_retro', ('keep', '5_retro'), ['Film looks,', 'your way.'], 'Eleven Retro styles, with Pro'),
    ('8_story', 'story', ['Ready for', 'Stories.'], 'On a colour or on your own photo, with Pro'),
    ('9_batch', ('keep', '3_batch'), ['Edit once.', 'Export fifteen.'], 'Up to 15 photos at once with Pro'),
    ('10_quality', 'quality', ['Full', 'resolution.'], 'Your camera’s native resolution, with Pro'),
]

# The Spanish set: the same scenes, captured with the app in Spanish.
SHOTS_ES = [
    ('1_home', 'home', ['Bordes, collages', 'y carruseles.'], 'Sin cuenta. Sin subir nada. Sin marca de agua.'),
    ('2_edit', 'editPlain', ['Edita, con o', 'sin bordes.'], 'Luz y color gratis; curvas con Pro'),
    ('3_border', 'caption', ['Bordes limpios.', 'Con tu texto.'], 'Escribe debajo de la foto, con Pro'),
    ('4_layouts', ('keep', '8_layouts'), ['Un diseño para', 'cada ocasión.'], 'Cuadrículas y plantillas creativas'),
    ('5_carousel', 'carousel', ['Carruseles que', 'fluyen.'], 'Una foto por post, cortadas para encajar — gratis'),
    ('6_retouch', 'retouch', ['Borra lo que', 'sobra.'], 'Pinta encima y desaparece, con Pro'),
    ('7_retro', ('keep', '5_retro'), ['Look de película,', 'a tu manera.'], 'Once estilos Retro, con Pro'),
    ('8_story', 'story', ['Listo para', 'Historias.'], 'Sobre un color o sobre tu foto, con Pro'),
    ('9_batch', ('keep', '3_batch'), ['Edita una vez.', 'Exporta quince.'], 'Hasta 15 fotos a la vez con Pro'),
    ('10_quality', 'quality', ['Calidad', 'máxima.'], 'A la resolución nativa de tu cámara, con Pro'),
]
# The commit holding the first 1.2 set, which 'keep' shots come from.
KEPT_FROM = '1b52b52'
SIZE_63 = (1206, 2622)

SKY = (156, 203, 234)
STORY_MARGIN = 0.045
BORDER = 0.04


def blurred_cover(photo: Image.Image, width: int, height: int) -> Image.Image:
    """The photo as the blurred backdrop (storyBackdrop.ts): shrunk to a
    240px long edge, blurred, dimmed a touch, then stretched to cover."""
    scale = 240 / max(photo.size)
    small = photo.resize((max(1, round(photo.width * scale)), max(1, round(photo.height * scale))), Image.LANCZOS)
    small = small.filter(ImageFilter.GaussianBlur(9.5)).point(lambda v: round(v * 0.88))
    k = max(width / small.width, height / small.height)
    big = small.resize((round(small.width * k), round(small.height * k)), Image.BICUBIC)
    left, top = (big.width - width) // 2, (big.height - height) // 2
    return big.crop((left, top, left + width, top + height))


def square(photo: Image.Image) -> Image.Image:
    """The centred 1:1 crop the story scene frames its photo in."""
    side = min(photo.size)
    left, top = (photo.width - side) // 2, (photo.height - side) // 2
    return photo.crop((left, top, left + side, top + side))


def story_export(photo: Image.Image, width: int, crop_square: bool) -> Image.Image:
    """What "Export with this background" makes from the story scene: the
    photo (square on the iPhone, 4:5 as given on the iPad) in a white border, centred on a 9:16 canvas of the photo
    itself, blurred, with a margin all round — the same geometry as
    exportImage.ts."""
    height = round(width * 16 / 9)
    canvas = blurred_cover(photo.convert('RGB'), width, height)
    src = square(photo.convert('RGB')) if crop_square else photo.convert('RGB')
    # The framed photo spans the width less the margin, or the height less
    # the same margin, whichever is tighter.
    margin = round(width * STORY_MARGIN)
    box_w, box_h = width - 2 * margin, height - 2 * margin
    aspect = src.width / src.height
    border_share = BORDER  # of the framed photo's short side
    # Framed size for a given inner photo width.
    def framed(inner_w: float) -> tuple[float, float]:
        inner_h = inner_w / aspect
        b = border_share * min(inner_w, inner_h) / (1 - 2 * border_share)
        return inner_w + 2 * b, inner_h + 2 * b
    lo, hi = 1.0, float(box_w)
    for _ in range(40):
        mid = (lo + hi) / 2
        fw, fh = framed(mid)
        if fw <= box_w and fh <= box_h:
            lo = mid
        else:
            hi = mid
    inner_w = round(lo)
    inner_h = round(inner_w / aspect)
    fw, fh = (round(v) for v in framed(inner_w))
    framed_img = Image.new('RGB', (fw, fh), (255, 255, 255))
    framed_img.paste(src.resize((inner_w, inner_h), Image.LANCZOS), ((fw - inner_w) // 2, (fh - inner_h) // 2))
    canvas.paste(framed_img, ((width - fw) // 2, (height - fh) // 2))
    return canvas


def story_screen(spec: dict, photo: Image.Image, img_height: int) -> Image.Image:
    """The finished Story as it looks opened on the device: as large as fits
    the full screen, centred, on black."""
    left, top, right, bottom = spec['screen']
    w = right - left
    h = (bottom or img_height) - top
    full_h = round(w * (2622 / 1206 if bottom is None else 2752 / 2064))
    story_w = min(w, round(full_h * 9 / 16))
    story = story_export(photo, story_w, crop_square=bottom is None)
    screen = Image.new('RGB', (w, max(h, full_h)), (0, 0, 0))
    screen.paste(story, ((w - story.width) // 2, max(0, (full_h - story.height) // 2)))
    return screen.crop((0, 0, w, h))


def font(size: int, weight: str) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(weight)
    return f


def repaint_header(img: Image.Image, until: int) -> None:
    """Fill the header with the background gradient taken from the far-left
    column, which no text ever reaches."""
    w = img.width
    column = img.crop((4, 0, 5, until)).resize((w, until))
    img.paste(column, (0, 0))


def write_header(img: Image.Image, spec: dict, title: list[str], subtitle: str) -> None:
    d = ImageDraw.Draw(img)
    size, baselines = spec['title']
    f = font(size, 'Bold')
    for line, y in zip(title, baselines):
        d.text((img.width / 2, y), line, font=f, fill=(255, 255, 255), anchor='ms')
    s_size, s_y = spec['subtitle']
    d.text((img.width / 2, s_y), subtitle, font=font(s_size, 'Regular'), fill=(170, 180, 196), anchor='ms')


def place_screen(img: Image.Image, spec: dict, capture: Image.Image) -> None:
    left, top, right, bottom = spec['screen']
    width = right - left
    shot = capture.convert('RGB').resize((width, round(capture.height * width / capture.width)), Image.LANCZOS)
    height = (bottom - top) if bottom else img.height - top
    shot = shot.crop((0, 0, width, min(height, shot.height)))
    mask = Image.new('L', shot.size, 0)
    r = spec['radius']
    # Rounded where the frame is: all four corners on iPad, the top two on
    # the iPhone, whose screen runs off the bottom of the image.
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1 + (0 if bottom else r * 2)), r, fill=255)
    img.paste(shot, (left, top), mask)


def kept(out: Path, device: str, old: str) -> Image.Image:
    """A shot from the first 1.2 set, as committed."""
    repo = HERE.parents[2]
    path = (out / f'{device}_{old}.jpg').resolve().relative_to(repo)
    data = subprocess.run(['git', 'show', f'{KEPT_FROM}:{path}'], cwd=repo, capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(data)).convert('RGB')


def to_63(img: Image.Image) -> Image.Image:
    """The 6.5" shot at 6.3" size: scaled to the height, centred."""
    w, h = SIZE_63
    scaled = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    left = (scaled.width - w) // 2
    return scaled.crop((left, 0, left + w, h))


def main() -> None:
    captures, out, story_photo = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    lang = sys.argv[4] if len(sys.argv) > 4 else 'en'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'iphone-6.3').mkdir(exist_ok=True)
    made: dict[str, Image.Image] = {}
    for device, spec in DEVICES.items():
        for name, source, title, subtitle in (SHOTS_ES if lang == 'es' else SHOTS):
            if isinstance(source, tuple):
                img = kept(out, device, source[1])
            else:
                img = Image.open(spec['template']).convert('RGB')
                repaint_header(img, spec['header_until'])
                write_header(img, spec, title, subtitle)
                if source == 'story_result':
                    shot = story_screen(spec, Image.open(story_photo), img.height)
                else:
                    shot = Image.open(captures / device / f'{source}-{lang}.png')
                place_screen(img, spec, shot)
            made[f'{device}_{name}'] = img
    # Written only once everything is read: kept shots come from the old names.
    for old in list(out.glob('iphone_*.jpg')) + list(out.glob('ipad_*.jpg')) + list((out / 'iphone-6.3').glob('*.jpg')):
        old.unlink()
    for key, img in made.items():
        img.save(out / f'{key}.jpg', quality=92)
        if key.startswith('iphone_'):
            to_63(img).save(out / 'iphone-6.3' / f'{key}.jpg', quality=92)
        print('wrote', key)


if __name__ == '__main__':
    main()
