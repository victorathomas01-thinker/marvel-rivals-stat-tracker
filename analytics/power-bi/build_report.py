"""Generate the three PBIR report pages in a saved Power BI project copy."""
import argparse
import hashlib
import json
from pathlib import Path

BASE = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/'
INK, MUTED, ACCENT, PAPER = '#152C43', '#43566A', '#146B73', '#F3F6F9'


def literal(value):
    if isinstance(value, bool):
        value = str(value).lower()
    elif isinstance(value, str):
        value = "'" + value.replace("'", "''") + "'"
    else:
        value = str(value)
    return {'expr': {'Literal': {'Value': value}}}


def color(value):
    return {'solid': {'color': literal(value)}}


def obj(**properties):
    return [{'properties': properties}]


def field(table, name, measure=False):
    return {('Measure' if measure else 'Column'): {
        'Expression': {'SourceRef': {'Entity': table}}, 'Property': name}}


def projection(table, name, measure=False, label=None):
    return {'field': field(table, name, measure), 'queryRef': f'{table}.{name}',
            'nativeQueryRef': name, 'displayName': label or name}


def identity(value):
    return hashlib.sha256(value.encode()).hexdigest()[:20]


class Page:
    def __init__(self, root, name, number, subtitle):
        self.name = identity(name)
        self.root = root / self.name
        self.visuals = []
        self.write(self.root / 'page.json', {
            '$schema': BASE + 'page/2.1.0/schema.json', 'name': self.name,
            'displayName': name, 'displayOption': 'FitToPage', 'width': 1280, 'height': 900,
            'objects': {'background': obj(color=color(PAPER), transparency=literal(0))}})
        self.text('eyebrow', 28, 18, 1224, 30, f'MATCHUP LAB   /   {number}   /   SYNTHETIC DEMO', 12, ACCENT, True)
        self.text('title', 28, 52, 1224, 60, name, 32, INK, True)
        self.text('subtitle', 28, 116, 1224, 50, subtitle, 14, MUTED)
        self.text('footer', 28, 850, 1224, 40,
                  'SIMULATED HISTORY  •  Outcomes generated independently of heroes  •  Recording date ≠ match date', 11, MUTED)

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    def add(self, key, kind, x, y, width, height, title='', alt='', query=None, objects=None, background='#FFFFFF'):
        name = identity(self.name + key)
        order = len(self.visuals)
        visual = {'visualType': kind, 'objects': objects or {}, 'visualContainerObjects': {
            'title': obj(show=literal(bool(title)), text=literal(title), fontSize=literal(16),
                         fontColor=color(INK), fontFamily=literal('Segoe UI'), bold=literal(True)),
            'background': obj(show=literal(True), color=color(background), transparency=literal(0)),
            'general': obj(altText=literal(alt or title)),
            'border': obj(show=literal(False)),
        }}
        if query:
            visual['query'] = query
        payload = {'$schema': BASE + 'visualContainer/2.7.0/schema.json', 'name': name,
                   'position': {'x': x, 'y': y, 'z': order, 'width': width, 'height': height,
                                'tabOrder': 9999 if key == 'footer' else order},
                   'visual': visual}
        self.write(self.root / 'visuals' / name / 'visual.json', payload)
        self.visuals.append(payload)
        return payload

    def text(self, key, x, y, width, height, text, size=15, tint=INK, bold=False, background=PAPER):
        paragraphs = [{'textRuns': [{'value': line, 'textStyle': {
            'fontFamily': 'Segoe UI', 'fontSize': f'{size}pt', 'color': tint,
            'fontWeight': 'bold' if bold else 'normal'}}]} for line in text.split('\n')]
        self.add(key, 'textbox', x, y, width, height, alt=text,
                 objects={'general': obj(paragraphs=paragraphs)}, background=background)

    def card(self, measure, label, x, y, width=294):
        self.add(measure, 'card', x, y, width, 126, label,
                 f'{label}. Value changes with active page filters.',
                 {'queryState': {'Values': {'projections': [projection('Matches', measure, True)]}}},
                 {'labels': obj(fontSize=literal(36), color=color(INK), labelDisplayUnits=literal(1)),
                  'categoryLabels': obj(show=literal(False))})

    def slicer(self, key, table, column, x, y, width, label):
        self.add(key, 'slicer', x, y, width, 84, label,
                 f'{label}. Clear the selection using the eraser in the visual header. Unknown dates are included when All is selected.',
                 {'queryState': {'Values': {'projections': [projection(table, column)]}}},
                 {'data': obj(mode=literal('Dropdown')), 'selection': obj(singleSelect=literal(False)),
                  'items': obj(fontSize=literal(14), fontColor=color(INK)),
                  'header': obj(show=literal(False))})

    def table(self, key, columns, x, y, width, height, title, sort=None):
        query = {'queryState': {'Values': {'projections': columns}}}
        if sort:
            query['sortDefinition'] = {'sort': [{'field': f, 'direction': d} for f, d in sort], 'isDefaultSort': True}
        visual = self.add(key, 'tableEx', x, y, width, height, title,
                 title + ('. Blank interval bounds mean fewer than five decisive encounters.' if key == 'hero-table'
                          else '. Empty table means that no source rows were rejected.'), query,
                 {'grid': obj(textSize=literal(14), rowPadding=literal(7), gridVertical=literal(False)),
                  'columnHeaders': obj(fontSize=literal(14), fontColor=color('#FFFFFF'), backColor=color(INK), wordWrap=literal(True), autoSizeColumnWidth=literal(True), columnAdjustment=literal('growToFit')),
                  'values': obj(fontSize=literal(15), fontColorPrimary=color(INK), fontColorSecondary=color(INK), backColorPrimary=color('#FFFFFF'), backColorSecondary=color('#EDF3F6')),
                  'total': obj(totals=literal(False))})
        visual['visual']['visualContainerObjects']['stylePreset'] = obj(name=literal('None'))
        self.write(self.root / 'visuals' / visual['name'] / 'visual.json', visual)


def build(report):
    root = report / 'definition/pages'
    overview = Page(root, 'Overview', '01', 'Start with the captured history. Use a recording-date selection to explore a smaller window.')
    overview.slicer('date', 'RecordingDate', 'RecordingDateKey', 28, 174, 430, 'Recording date  ·  includes Unknown')
    overview.text('date-help', 486, 180, 766, 74, 'All dates includes records without a timestamp.\nDate selections describe recording activity, not when matches occurred.', 13)
    for x, measure, label in [(28, 'Captured Matches', 'Captured matches'), (338, 'Decisive Matches', 'Wins + losses'),
                              (648, 'Overall Loss Rate', 'Overall loss rate'), (958, 'Draws', 'Draws · excluded from rates')]:
        overview.card(measure, label, x, 280)
    overview.add('outcomes', 'clusteredColumnChart', 28, 432, 770, 385, 'Outcomes in the selected history',
                 'Column chart of captured matches by win, loss, and draw. Labels give counts. Draws are excluded from loss-rate denominators.',
                 {'queryState': {'Category': {'projections': [projection('Matches', 'Outcome')]},
                                 'Y': {'projections': [projection('Matches', 'Captured Matches', True)]}}},
                 {'labels': obj(show=literal(True), fontSize=literal(14), color=color(INK)),
                  'dataPoint': obj(defaultColor=color(ACCENT)),
                  'categoryAxis': obj(fontSize=literal(14), fontColor=color(INK), showAxisTitle=literal(False)),
                  'valueAxis': obj(fontSize=literal(12), fontColor=color(MUTED), showAxisTitle=literal(False))})
    overview.text('reading-guide', 824, 432, 428, 385,
                  'HOW TO READ THIS\n\nLoss rate = losses ÷ (wins + losses).\n\nHero selections on Matchups change encounter measures, while the overall baseline keeps the date selection.\n\nThis is simulated data, not evidence that one hero causes losses.', 16, background='#FFFFFF')

    matchups = Page(root, 'Matchups', '02', 'Compare observed rates with sample sizes and 95% Wilson intervals. Patterns here are simulated.')
    matchups.slicer('date', 'RecordingDate', 'RecordingDateKey', 28, 174, 404, 'Recording date')
    matchups.slicer('hero', 'Heroes', 'Hero', 456, 174, 404, 'Hero · multi-select supported')
    matchups.card('Overall Loss Rate', 'Date-selected baseline', 884, 174, 368)
    matchups.text('interval-guide', 28, 310, 1224, 60,
                  'Intervals require at least 5 decisive encounters. Blank bounds = insufficient sample.\nSorted by lower bound, then encounter count, then hero name. Compare uncertainty before ranking.', 13)
    columns = [projection('Heroes', 'Hero'), projection('Matches', 'Hero Encounters', True, 'Encounters'),
               projection('Matches', 'Hero Losses', True, 'Losses'), projection('Matches', 'Hero Loss Rate', True, 'Loss rate'),
               projection('Matches', 'Wilson Lower', True, '95% lower'), projection('Matches', 'Wilson Upper', True, '95% upper')]
    matchups.table('hero-table', columns, 28, 386, 1224, 438, 'Decisive encounters by hero',
                   [(field('Matches', 'Wilson Lower', True), 'Descending'),
                    (field('Matches', 'Hero Encounters', True), 'Descending'), (field('Heroes', 'Hero'), 'Ascending')])

    quality = Page(root, 'Data Quality', '03', 'Audit what is missing, repeated, or rejected before interpreting the matchup rates. This page shows the whole import.')
    for x, measure, label in [(28, 'Missing Recording Dates', 'Missing recording dates'), (338, 'Missing Scores', 'Missing either score'),
                              (648, 'Repeated Appearances', 'Repeated hero appearances'), (958, 'Rejected Rows', 'Rejected source rows')]:
        quality.card(measure, label, x, 174)
    quality.text('grain', 28, 326, 392, 294,
                 'ONE MATCH, ONE OUTCOME\n\nMatch IDs identify rows within one export. Never combine different players without a dataset identity.\n\nRepeated hero entries count once per match for rates. The raw appearance count is retained.', 15, background='#FFFFFF')
    quality.text('missing', 444, 326, 392, 294,
                 'MISSING IS VISIBLE\n\nNull dates and scores are accepted. They still contribute to all-time match outcomes.\n\nUnknown is an explicit recording-date category. No match-occurrence date is available.', 15, background='#FFFFFF')
    quality.text('limits', 860, 326, 392, 294,
                 'LIMITS OF THE EVIDENCE\n\nDuplicate IDs quarantine every occurrence. Invalid records include a reason and source-row number.\n\nMaps, teammates, opponents, and capture choices can influence results. Intervals do not remove selection bias.', 15, background='#FFFFFF')
    quality.table('rejections', [projection('Rejections', 'SourceRow', label='Source row'),
                               projection('Rejections', 'MatchId', label='Match ID'), projection('Rejections', 'Reason')],
                  28, 646, 1224, 142, 'Rejected records · empty when no rows were rejected')
    quality.text('rejection-note', 28, 800, 1224, 42, 'Synthetic fixture: 360 accepted rows, 0 rejected. Counts above remain dynamic when the import changes.', 12)
    Page.write(root / 'pages.json', {'$schema': BASE + 'pagesMetadata/1.1.0/schema.json',
                                   'pageOrder': [p.name for p in (overview, matchups, quality)],
                                   'activePageName': overview.name})
    return [overview, matchups, quality]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path, help='Existing *.Report folder saved by Desktop using PBIR')
    args = parser.parse_args()
    if not (args.report / 'definition.pbir').is_file():
        parser.error('Use an existing Power BI project Report folder.')
    pages = build(args.report)
    print(json.dumps({p.name: len(p.visuals) for p in pages}, indent=2))
