"""Build a local SQLite model and a portable Power Query JSON bundle."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import subprocess

ROOT = Path(__file__).resolve().parent
TABLES = ('Matches', 'Heroes', 'MatchHeroes', 'RecordingDate', 'Rejections')


def build(source, destination):
    result = subprocess.run(['node', str(ROOT / 'prepare.mjs'), str(source)],
                            check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout)
    connection = sqlite3.connect(':memory:')
    connection.row_factory = sqlite3.Row
    for statement in (ROOT / 'transform.sql').read_text(encoding='utf-8').split(';'):
        if statement.strip():
            connection.execute(statement, {'payload': result.stdout})
    bundle = {table: [dict(row) for row in connection.execute(f'SELECT * FROM {table}')]
              for table in TABLES}
    bundle['ImportSummary'] = [{
        'SourceRows': len(payload['accepted']) + len(payload['rejected']),
        'AcceptedRows': len(payload['accepted']), 'RejectedRows': len(payload['rejected'])}]
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'model.json').write_text(json.dumps(bundle, indent=2) + '\n', encoding='utf-8')
    with closing(sqlite3.connect(destination / 'model.sqlite')) as target:
        connection.backup(target)
    connection.close()
    return bundle


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'data/synthetic-match-history.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'generated')
    args = parser.parse_args()
    model = build(args.source, args.output)
    print(json.dumps({key: len(value) for key, value in model.items()}, indent=2))
