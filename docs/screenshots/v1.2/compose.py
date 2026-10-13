"""Composes the 1.2 App Store screenshots.

Each one reuses a 1.1 screenshot as the template — its navy background and
device frame — repaints the headline area from the background's own gradient,
writes the new headline, and drops a fresh simulator capture into the frame's
screen. Captures come from the app's screenshots mode (src/lib/shots.ts).

    python3 compose.py <captures dir with iphone/ and ipad/> <out dir> <story photo> [en|es]
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

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

SHOTS = [
    ('1_home', 'home', ['Borders & collages', 'for your photos.'], 'No account. No uploads. No watermark.'),
    ('2_border', 'border', ['Clean borders.', 'Full quality.'], 'Frame any photo in seconds'),
    ('3_batch', 'batch', ['Edit once.', 'Export fifteen.'], 'Up to 15 photos at once with Pro'),
    ('4_edit', 'edit', ['Edit every', 'photo.'], 'Light and colour, photo by photo — free'),
    ('5_retro', 'retro', ['Film looks,', 'your way.'], 'Eleven Retro styles, with Pro'),
    ('6_story', 'story', ['Ready for', 'Stories.'], 'Export on a 9:16 background, with Pro'),
    ('7_story_result', None, ['Post it', 'as it is.'], '9:16, background included'),
    ('8_layouts', 'layouts', ['A layout for', 'every set.'], 'Grids and creative templates'),
]

# The Spanish set: the same scenes, captured with the app in Spanish.
SHOTS_ES = [
    ('1_home', 'home', ['Bordes y collages', 'para tus fotos.'], 'Sin cuenta. Sin subir nada. Sin marca de agua.'),
    ('2_border', 'border', ['Bordes limpios.', 'Calidad total.'], 'Enmarca cualquier foto en segundos'),
    ('3_batch', 'batch', ['Edita una vez.', 'Exporta quince.'], 'Hasta 15 fotos a la vez con Pro'),
    ('4_edit', 'edit', ['Edita cada', 'foto.'], 'Luz y color, foto por foto — gratis'),
    ('5_retro', 'retro', ['Look de película,', 'a tu manera.'], 'Once estilos Retro, con Pro'),
    ('6_story', 'story', ['Listo para', 'Historias.'], 'Exporta sobre un fondo 9:16, con Pro'),
    ('7_story_result', None, ['Publícala', 'tal cual.'], '9:16, con el fondo incluido'),
    ('8_layouts', 'layouts', ['Un diseño para', 'cada ocasión.'], 'Cuadrículas y plantillas creativas'),
]
READY = {'en': (['Ready to post.'], 'Exported at full resolution'), 'es': (['Lista para publicar.'], 'Exportada a resolución completa')}

SKY = (156, 203, 234)
STORY_MARGIN = 0.045
BORDER = 0.04


def story_export(photo: Image.Image, width: int) -> Image.Image:
    """What "Export with this background" makes from a photo shown as-shot
    ("Original" aspect): the photo in a white border, centred on a 9:16
    sky-blue canvas with a margin all round — the same geometry as
    exportImage.ts."""
    height = round(width * 16 / 9)
    canvas = Image.new('RGB', (width, height), SKY)
    src = photo.convert('RGB')
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
    story = story_export(photo, story_w)
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


def main() -> None:
    captures, out, story_photo = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    lang = sys.argv[4] if len(sys.argv) > 4 else 'en'
    out.mkdir(parents=True, exist_ok=True)
    for device, spec in DEVICES.items():
        for name, capture, title, subtitle in (SHOTS_ES if lang == 'es' else SHOTS):
            img = Image.open(spec['template']).convert('RGB')
            repaint_header(img, spec['header_until'])
            write_header(img, spec, title, subtitle)
            if capture:
                shot = Image.open(captures / device / f'{capture}.png')
            else:
                shot = story_screen(spec, Image.open(story_photo), img.height)
            place_screen(img, spec, shot)
            img.save(out / f'{device}_{name}.jpg', quality=92)
            print('wrote', device, name)
    # The finished-collage close-up has no editor UI in it, so the 1.1 one
    # still holds; only its headline is rewritten in the same type.
    spec = DEVICES['iphone']
    img = Image.open(OLD / 'iphone_8_ready.jpg').convert('RGB')
    repaint_header(img, spec['header_until'])
    write_header(img, spec, *READY[lang])
    img.save(out / 'iphone_9_ready.jpg', quality=92)
    print('wrote iphone 9_ready')


if __name__ == '__main__':
    main()
