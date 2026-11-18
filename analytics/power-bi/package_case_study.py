"""Package the viewable demo and rebuildable source, excluding local state."""
import argparse
import hashlib
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
EXCLUDED = {'generated', '__pycache__', '.pbi', 'TMDLScripts', 'DAXQueries'}


def package(output):
    files = {}
    for file in ROOT.rglob('*'):
        relative = file.relative_to(ROOT)
        if file.is_file() and not EXCLUDED.intersection(relative.parts) and file.name != '.platform':
            files['analytics/power-bi/' + relative.as_posix()] = file.read_bytes()
    files['match-data.js'] = (REPO / 'match-data.js').read_bytes()
    files['START-HERE.md'] = (
        '# Matchup analytics demo\n\n'
        'Open analytics/power-bi/demo/marvel-rivals-analytics.pbix in Power BI Desktop for the ready-to-view synthetic snapshot. '
        'The PDF and PNGs in the same folder are visual previews.\n\n'
        'For an editable, refreshable project, install Node.js 22+ and Python 3.12+, then run '
        '`python analytics/power-bi/prepare_project.py` from this folder. Open the printed PBIP path and choose Refresh in Desktop. '
        'No Power BI service account is needed for local viewing.\n\n'
        'The case-study README describes the metric contract, validation, accessibility limits, and a two-minute walkthrough. '
        'The PDF is untagged; use the native report for interactive/accessibility features.\n'
    ).encode()
    required = ['demo/marvel-rivals-analytics.pbix', 'demo/marvel-rivals-analytics.pdf', 'prepare_project.py']
    for name in required:
        if 'analytics/power-bi/' + name not in files:
            raise ValueError(f'Missing deliverable: {name}')
    files['SHA256SUMS.txt'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n'
                                    for name, data in sorted(files.items())).encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    return len(files)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(f'Packaged {package(args.output)} files into {args.output}')
