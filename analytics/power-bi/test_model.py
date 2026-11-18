"""Integration checks for grains, exclusions, and extension metric parity."""
import copy
import json
import math
from pathlib import Path
import subprocess
import tempfile
import unittest

from build_model import ROOT, build
from prepare_project import prepare


class ModelChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.destination = Path(self.temp.name)
        self.source = ROOT / 'data/synthetic-match-history.json'

    def test_fixture_and_extension_parity(self):
        model = build(self.source, self.destination)
        matches = {row['MatchId']: row for row in model['Matches']}
        self.assertEqual(len(matches), 360)
        self.assertEqual(sum(row['Outcome'] == 'loss' for row in matches.values()), 169)
        self.assertEqual(sum(row['Outcome'] == 'win' for row in matches.values()), 179)
        self.assertEqual(sum(row['Outcome'] == 'draw' for row in matches.values()), 12)
        self.assertEqual(sum(row['RecordedAt'] is None for row in matches.values()), 13)
        self.assertEqual(sum(row['PlayerScore'] is None or row['OpponentScore'] is None
                             for row in matches.values()), 10)
        encounters = model['MatchHeroes']
        self.assertEqual(len({(r['MatchId'], r['Hero']) for r in encounters}), len(encounters))
        self.assertEqual(sum(row['AppearanceCount'] - 1 for row in encounters), 33)
        self.assertEqual(len(model['Heroes']), 12)
        self.assertEqual(model['Rejections'], [])
        script = """
const fs = require('node:fs'), vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('match-data.js', 'utf8'), context);
console.log(JSON.stringify(context.rankMatchups(context.readHistory(
  JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))))));
"""
        expected = json.loads(subprocess.run(['node', '-e', script, str(self.source)],
                              cwd=ROOT.parent.parent, check=True, capture_output=True, text=True).stdout)
        for hero in expected:
            rows = [matches[row['MatchId']] for row in encounters
                    if row['Hero'] == hero['hero'] and matches[row['MatchId']]['Outcome'] != 'draw']
            n = len(rows)
            losses = sum(row['Outcome'] == 'loss' for row in rows)
            self.assertEqual((n, losses), (hero['encounters'], hero['losses']))
            rate, z = losses / n, 1.96
            scale = 1 + z*z/n
            center = (rate + z*z/(2*n)) / scale
            margin = z * math.sqrt(rate*(1-rate)/n + z*z/(4*n*n)) / scale
            self.assertAlmostEqual(rate, hero['rate'], places=12)
            self.assertAlmostEqual(max(0, center-margin), hero['low'], places=12)
            self.assertAlmostEqual(min(1, center+margin), hero['high'], places=12)

    def test_quarantine_and_unknown_date(self):
        fixture = json.loads(self.source.read_text(encoding='utf-8'))
        base = fixture['matches'][0]
        rows = [copy.deepcopy(base) for _ in range(8)]
        for index, row in enumerate(rows):
            row['id'] = f'edge-{index}'
        rows[1]['id'] = rows[0]['id']
        rows[2]['outcome'] = 'unknown'
        rows[3]['recordedAt'] = 'not-a-date'
        rows[4]['playerScore'] = -1
        rows[5]['heroes'][0]['hero'] = ''
        rows[6]['heroes'] = []  # Legal in the extension; still contributes match outcomes.
        rows[7]['playerScore'] = 1.5
        source = self.destination / 'edge.json'
        source.write_text(json.dumps({'schemaVersion': 1, 'matches': rows}), encoding='utf-8')
        model = build(source, self.destination / 'edge')
        self.assertEqual(len(model['Matches']), 1)
        self.assertEqual(model['Matches'][0]['MatchId'], 'edge-6')
        self.assertEqual(model['Matches'][0]['RecordingDateKey'], 'Unknown')
        self.assertEqual(model['MatchHeroes'], [])
        self.assertEqual(len(model['Rejections']), 7)
        self.assertEqual(sum(row['Reason'] == 'duplicate_match_id' for row in model['Rejections']), 2)
        source.write_text(json.dumps({'schemaVersion': 2, 'matches': rows}), encoding='utf-8')
        with self.assertRaises(subprocess.CalledProcessError):
            build(source, self.destination / 'unsupported')

    def test_project_can_be_prepared_in_a_new_location(self):
        destination = self.destination / 'relocated project'
        project = prepare(destination, self.source)
        self.assertTrue(project.is_file())
        expression = (destination / 'marvel-rivals-analytics.SemanticModel/definition/expressions.tmdl').read_text(encoding='utf-8')
        self.assertIn(str(destination.resolve() / 'data/model.json'), expression)
        self.assertNotIn('__MODEL_JSON__', expression)
        model = json.loads((destination / 'data/model.json').read_text(encoding='utf-8'))
        self.assertEqual(len(model['Matches']), 360)
        pages = destination / 'marvel-rivals-analytics.Report/definition/pages'
        order = json.loads((pages / 'pages.json').read_text(encoding='utf-8'))
        self.assertEqual(len(order['pageOrder']), 3)
        first = json.loads((pages / order['activePageName'] / 'page.json').read_text(encoding='utf-8'))
        self.assertEqual(first['displayName'], 'Overview')
        self.assertFalse(list(destination.rglob('.pbi')))
        protected = self.destination / 'customized report'
        protected.mkdir()
        (protected / 'important.txt').write_text('Keep my edits', encoding='utf-8')
        with self.assertRaises(ValueError):
            prepare(protected, self.source)
        self.assertEqual((protected / 'important.txt').read_text(encoding='utf-8'), 'Keep my edits')


if __name__ == '__main__':
    unittest.main()
