"""Generate committed web assets; originals stay local, never required by CI.
Usage: python scripts/generate-background-presets.py (requires Pillow)
"""
from pathlib import Path
import hashlib
import io
import json
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
source = root / 'images' / '预设自定义背景'
destination = root / 'public' / 'backgrounds'
manifest = root / 'src' / 'utils' / 'backgroundPresets.json'
sources = sorted(source.glob('*.png'))
if not sources:
    raise SystemExit(f'No PNG originals found in {source}; existing assets were preserved.')
previous = json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else []
(destination / 'full').mkdir(parents=True, exist_ok=True)
(destination / 'thumbs').mkdir(parents=True, exist_ok=True)
presets = []
for path in sources:
    category, title = path.stem.split('-', 1)
    identifier = hashlib.sha256(path.stem.encode()).hexdigest()[:12]
    with Image.open(path) as original:
        picture = ImageOps.exif_transpose(original).convert('RGB')
        picture.thumbnail((3840, 3840), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        picture.save(output, 'WEBP', quality=84, method=6)
        data = output.getvalue()
        version = hashlib.sha256(data).hexdigest()[:12]
        filename = f'{identifier}-{version}.webp'
        (destination / 'full' / filename).write_bytes(data)
        thumbnail = picture.copy()
        thumbnail.thumbnail((480, 480), Image.Resampling.LANCZOS)
        thumbnail.save(destination / 'thumbs' / filename, 'WEBP', quality=76, method=6)
        presets.append(dict(id=identifier, category=category, title=title,
                            image=f'backgrounds/full/{filename}', thumbnail=f'backgrounds/thumbs/{filename}',
                            width=picture.width, height=picture.height, bytes=len(data)))
        print(f'{path.name}: {len(data):,} bytes', flush=True)
manifest.write_text(json.dumps(presets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
# Only remove obsolete files recorded in the previous manifest, after checking
# their exact resolved parent. Never delete originals or unrelated files.
current_paths = {preset[key] for preset in presets for key in ('image', 'thumbnail')}
allowed_parents = {(destination / kind).resolve() for kind in ('full', 'thumbs')}
for preset in previous:
    for key in ('image', 'thumbnail'):
        relative = preset[key]
        obsolete = (root / 'public' / relative).resolve()
        if relative not in current_paths and obsolete.parent in allowed_parents and obsolete.suffix == '.webp':
            obsolete.unlink(missing_ok=True)
print(f'Total: {sum(p["bytes"] for p in presets):,} bytes')
