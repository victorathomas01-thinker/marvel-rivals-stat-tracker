"""Generate a TMDL script for a new, dedicated Power BI report."""
import argparse
from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parent
COLUMNS = {
    'Matches': [('MatchId', 'string'), ('Outcome', 'string'), ('RecordedAt', 'dateTime'),
                ('RecordingDateKey', 'string'), ('PlayerScore', 'int64'), ('OpponentScore', 'int64')],
    'Heroes': [('Hero', 'string')],
    'MatchHeroes': [('MatchId', 'string'), ('Hero', 'string'), ('AppearanceCount', 'int64')],
    'RecordingDate': [('RecordingDateKey', 'string'), ('RecordingDate', 'dateTime'), ('IsUnknown', 'int64')],
    'Rejections': [('SourceRow', 'int64'), ('MatchId', 'string'), ('Reason', 'string')],
    'ImportSummary': [('SourceRows', 'int64'), ('AcceptedRows', 'int64'), ('RejectedRows', 'int64')],
}
MEASURES = {
    'Captured Matches': 'COALESCE(COUNTROWS(Matches), 0)',
    'Wins': 'CALCULATE([Captured Matches], KEEPFILTERS(Matches[Outcome] = "win"))',
    'Losses': 'CALCULATE([Captured Matches], KEEPFILTERS(Matches[Outcome] = "loss"))',
    'Draws': 'CALCULATE([Captured Matches], KEEPFILTERS(Matches[Outcome] = "draw"))',
    'Decisive Matches': '[Wins] + [Losses]',
    'Overall Loss Rate': 'CALCULATE(DIVIDE([Losses], [Decisive Matches]), REMOVEFILTERS(Heroes))',
    'Hero Encounters': 'COALESCE(CALCULATE(DISTINCTCOUNT(MatchHeroes[MatchId]), KEEPFILTERS(Matches[Outcome] IN {"win", "loss"})), 0)',
    'Hero Losses': 'COALESCE(CALCULATE(DISTINCTCOUNT(MatchHeroes[MatchId]), KEEPFILTERS(Matches[Outcome] = "loss")), 0)',
    'Hero Loss Rate': 'DIVIDE([Hero Losses], [Hero Encounters])',
    'Eligible Hero': 'IF([Hero Encounters] >= 5, 1, 0)',
    'Wilson Lower': '''VAR n = [Hero Encounters]
VAR p = [Hero Loss Rate]
VAR z = 1.96
VAR scale = 1 + DIVIDE(z*z, n)
VAR center = DIVIDE(p + DIVIDE(z*z, 2*n), scale)
VAR margin = DIVIDE(z * SQRT(DIVIDE(p*(1-p), n) + DIVIDE(z*z, 4*n*n)), scale)
RETURN IF(n >= 5, MAX(0, center - margin))''',
    'Wilson Upper': '''VAR n = [Hero Encounters]
VAR p = [Hero Loss Rate]
VAR z = 1.96
VAR scale = 1 + DIVIDE(z*z, n)
VAR center = DIVIDE(p + DIVIDE(z*z, 2*n), scale)
VAR margin = DIVIDE(z * SQRT(DIVIDE(p*(1-p), n) + DIVIDE(z*z, 4*n*n)), scale)
RETURN IF(n >= 5, MIN(1, center + margin))''',
    'Repeated Appearances': 'COALESCE(SUM(MatchHeroes[AppearanceCount]), 0) - COALESCE(COUNTROWS(MatchHeroes), 0)',
    'Missing Recording Dates': 'CALCULATE([Captured Matches], KEEPFILTERS(ISBLANK(Matches[RecordedAt])))',
    'Missing Scores': 'CALCULATE([Captured Matches], KEEPFILTERS(ISBLANK(Matches[PlayerScore]) || ISBLANK(Matches[OpponentScore])))',
    'Rejected Rows': 'COALESCE(COUNTROWS(Rejections), 0)',
}


def generate(model_path):
    adapter = (ROOT / 'ModelTables.pq').read_text(encoding='utf-8')
    adapter = adapter[adapter.index('let\n'):].replace('C:\\REPLACE_ME\\generated\\model.json', str(model_path).replace('"', '""'))
    lines = ['createOrReplace', '', '\texpression ModelTables =', textwrap.indent(adapter.rstrip(), '\t\t'), '']
    for table, columns in COLUMNS.items():
        lines += [f'\ttable {table}']
        if table == 'Matches':
            for name, dax in MEASURES.items():
                lines += [f"\t\tmeasure '{name}' = ```", textwrap.indent(dax, '\t\t\t'), '\t\t\t```',
                          '\t\t\tformatString: ' + ('0.0%' if 'Rate' in name or 'Wilson' in name else '#,##0'), '']
        for name, data_type in columns:
            lines += [f'\t\tcolumn {name}', f'\t\t\tdataType: {data_type}', '\t\t\tsummarizeBy: none', f'\t\t\tsourceColumn: {name}', '']
        lines += [f'\t\tpartition {table} = m', '\t\t\tmode: import', f'\t\t\tsource = ModelTables[{table}]', '']
    for name, child, child_column, parent, parent_column in (
            ('MatchDate', 'Matches', 'RecordingDateKey', 'RecordingDate', 'RecordingDateKey'),
            ('EncounterMatch', 'MatchHeroes', 'MatchId', 'Matches', 'MatchId'),
            ('EncounterHero', 'MatchHeroes', 'Hero', 'Heroes', 'Hero')):
        lines += [f'\trelationship {name}', f'\t\tfromColumn: {child}.{child_column}',
                  f'\t\ttoColumn: {parent}.{parent_column}', '\t\tcrossFilteringBehavior: oneDirection', '']
    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, default=ROOT / 'generated/model.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'generated/model.tmdl')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(generate(args.model.resolve()), encoding='utf-8')
    print(args.output)
