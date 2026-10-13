"""Composes the 1.2 App Store screenshots.

Each one reuses a 1.1 screenshot as the template — its navy background and
device frame — repaints the headline area from the background's own gradient,
writes the new headline, and drops a fresh simulator capture into the frame's
screen. Captures come from the app's screenshots mode (src/lib/shots.ts).

    python3 compose.py <captures dir with iphone/ and ipad/> <out dir> <story photo>
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
    ('4_edit', 'edit', ['Edit every', 'photo.'], 'Light, colour, grain and sharpness, with Pro'),
    ('5_retro', 'retro', ['Film looks,', 'your way.'], 'Eleven Retro styles, with Pro'),
    ('6_story', 'story', ['Ready for', 'Stories.'], 'Export on a 9:16 background, with Pro'),
    ('7_story_result', None, ['Post it', 'as it is.'], '9:16, background included'),
    ('8_layouts', 'layouts', ['A layout for', 'every set.'], 'Grids and creative templates'),
]

SKY = (156, 203, 234)
STORY_MARGIN = 0.045
BORDER = 0.04


def story_export(photo: Image.Image, width: int) -> Image.Image:
    """What "Export with this background" makes: the photo cropped 4:5 in a
    white border, centred on a 9:16 sky-blue canvas with a margin all round —
    the same geometry as exportImage.ts."""
    height = round(width * 16 / 9)
    canvas = Image.new('RGB', (width, height), SKY)
    framed_w = round(width * (1 - 2 * STORY_MARGIN))
    framed_h = round(framed_w * 5 / 4)
    border = round(BORDER * framed_w)
    inner = (framed_w - 2 * border, framed_h - 2 * border)
    src = photo.convert('RGB')
    scale = max(inner[0] / src.width, inner[1] / src.height)
    src = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
    left, top = (src.width - inner[0]) // 2, (src.height - inner[1]) // 2
    src = src.crop((left, top, left + inner[0], top + inner[1]))
    framed = Image.new('RGB', (framed_w, framed_h), (255, 255, 255))
    framed.paste(src, (border, border))
    canvas.paste(framed, ((width - framed_w) // 2, (height - framed_h) // 2))
    return canvas


def story_screen(spec: dict, photo: Image.Image, img_height: int) -> Image.Image:
    """The finished Story as it looks opened on the device: full width, on black."""
    left, top, right, bottom = spec['screen']
    w = right - left
    h = (bottom or img_height) - top
    screen = Image.new('RGB', (w, h), (0, 0, 0))
    story = story_export(photo, w)
    # Centred in the device's full screen height, not just the visible part.
    full_h = round(w * (2622 / 1206 if bottom is None else 2752 / 2064))
    y = max(0, (full_h - story.height) // 2)
    screen.paste(story, (0, y))
    return screen


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
    out.mkdir(parents=True, exist_ok=True)
    for device, spec in DEVICES.items():
        for name, capture, title, subtitle in SHOTS:
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
    write_header(img, spec, ['Ready to post.'], 'Exported at full resolution')
    img.save(out / 'iphone_9_ready.jpg', quality=92)
    print('wrote iphone 9_ready')


if __name__ == '__main__':
    main()
