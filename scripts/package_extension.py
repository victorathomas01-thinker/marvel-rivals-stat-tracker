"""Build a reproducible ZIP for Chrome's Load unpacked workflow."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    'background.js', 'content.css', 'content.js', 'manifest.json', 'match-data.js',
    'matchup-view.js', 'popup.css', 'popup.html', 'popup.js', 'ranking.js',
)


def package(destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w') as archive:
        for name in FILES:
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            archive.writestr(entry, (ROOT / name).read_bytes().replace(b'\r\n', b'\n'), compress_type=ZIP_DEFLATED)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    package(parser.parse_args().destination)
