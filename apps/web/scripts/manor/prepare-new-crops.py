"""Slice the seven imagegen crop sheets into existing, anchored game sprites.

Input: <input-dir>/<crop>.png, a transparent 3 x 3 sheet in reading order:
seed mounds, sprout, young plant, flowering/unripe, ripe, produce, seed packet.
Only the new r63 assets are written. Existing scene/crop images are immutable.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageOps

KEYS = ("pea", "potato", "cucumber", "rosemary", "watermelon", "grape", "tea")
SIZES = ((340, 180), (340, 240), (390, 300), (390, 340), (390, 350), (400, 400))


def visible_box(image):
    return image.getchannel("A").point(lambda alpha: 255 if alpha > 24 else 0).getbbox()


def prepare(input_dir, output_dir):
    bounds, files = {}, []
    for key in KEYS:
        sheet = Image.open(input_dir / f"{key}.png").convert("RGBA")
        assert sheet.getchannel("A").getextrema() == (0, 255), f"{key}: real alpha required"
        w, h = sheet.size
        bounds[key] = []
        for cell in range(7):
            col, row = cell % 3, cell // 3
            tile = sheet.crop((round(col*w/3), round(row*h/3), round((col+1)*w/3), round((row+1)*h/3)))
            box = visible_box(tile)
            assert box, f"{key}: empty cell {cell+1}"
            target = Image.new("RGBA", (512, 512))
            art = ImageOps.contain(tile.crop(box), SIZES[cell] if cell < 6 else (400, 454), Image.Resampling.LANCZOS)
            left = (512-art.width)//2
            top = 488-art.height if cell < 5 else (512-art.height)//2
            target.alpha_composite(art, (left, top))
            file = output_dir / (f"crop-{key}-{cell+1}-r63.webp" if cell < 6 else f"seed-{key}-r63.webp")
            target.save(file, quality=94, method=6, alpha_quality=100, exact=True)
            assert Image.open(file).getchannel("A").tobytes() == target.getchannel("A").tobytes(), file
            if cell < 5:
                bounds[key].append(list(visible_box(target)))
            files.append(file)
    return {"bounds": bounds, "files": len(files), "bytes": sum(file.stat().st_size for file in files)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[2] / "public/manor/knowledge-garden-v19/farm")
    args = parser.parse_args()
    print(json.dumps(prepare(args.input_dir, args.output_dir), ensure_ascii=False))
