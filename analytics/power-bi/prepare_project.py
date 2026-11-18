"""Create a refreshable local PBIP from the tracked template and one export."""
import argparse
from pathlib import Path
import re
import shutil

from build_model import ROOT, build
from build_report import build as build_pages


def prepare(destination, source):
    destination = destination.resolve()
    template = ROOT / 'project'
    if destination == template or template in destination.parents:
        raise ValueError('Choose an output outside the tracked template.')
    marker = destination / '.prepared-by-case-study'
    if destination.exists() and any(destination.iterdir()) and not marker.is_file():
        raise ValueError('Output must be empty or previously prepared by this script. Save custom report edits elsewhere.')
    shutil.copytree(template, destination, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('.pbi', 'TMDLScripts', 'DAXQueries', '.platform'))
    build(source, destination / 'data')
    expression = destination / 'marvel-rivals-analytics.SemanticModel/definition/expressions.tmdl'
    content = expression.read_text(encoding='utf-8')
    model_path = str(destination / 'data/model.json').replace('"', '""')
    content, replaced = re.subn(r'ModelPath = "[^"]*"', lambda _: f'ModelPath = "{model_path}"', content)
    if replaced != 1:
        raise ValueError('Expected exactly one ModelPath expression.')
    expression.write_text(content, encoding='utf-8')
    build_pages(destination / 'marvel-rivals-analytics.Report')
    marker.write_text('Generated from the public case-study template. Rerunning replaces template files.\n', encoding='utf-8')
    return destination / 'marvel-rivals-analytics.pbip'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'generated/project')
    parser.add_argument('--source', type=Path, default=ROOT / 'data/synthetic-match-history.json')
    args = parser.parse_args()
    print(prepare(args.output, args.source.resolve()))
