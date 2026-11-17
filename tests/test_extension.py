"""Exercise the unpacked extension in Chromium against synthetic match pages."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests' / 'fixtures' / 'scoreboard.html'
ORIGIN = 'https://tracker.gg/marvel-rivals/matches/'


def fixture_response(html):
    return lambda route: route.fulfill(body=html, content_type='text/html')


class ExtensionTest(unittest.TestCase):
    def test_match_outcomes_and_deduplication_appear_in_export(self):
        with TemporaryDirectory() as profile, sync_playwright() as playwright:
            browser = playwright.chromium.launch_persistent_context(
                profile, channel='chromium', headless=True, args=[
                    f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}',
                ],
            )
            try:
                worker = browser.service_workers[0] if browser.service_workers else browser.wait_for_event('serviceworker')
                popup = worker.url.rsplit('/', 1)[0] + '/popup.html'
                page = browser.new_page()
                page.goto(popup)
                page.get_by_label('Tracker.gg player name').fill('Scout')
                page.get_by_role('button', name='Save').click()
                page.get_by_text('Player name saved.', exact=True).wait_for()

                template = FIXTURE.read_text(encoding='utf-8')
                cases = {'win': (2, 1), 'loss': (0, 2), 'draw': (1, 1)}
                captured = {
                    'archived-win': ('win', 1, 0, 6),
                    'archived-loss': ('loss', 0, 2, 6),
                    'current-win': ('win', 2, 1, 12),
                    'current-loss': ('loss', 0, 2, 8),
                }
                total_matches = len(cases) + len(captured)
                browser.route('https://tracker.gg/**', lambda route: route.abort())
                for outcome, (score_a, score_b) in cases.items():
                    url = ORIGIN + outcome
                    html = template.replace('{{SCORE_A}}', str(score_a)).replace('{{SCORE_B}}', str(score_b))
                    browser.route(url, fixture_response(html))
                    page.goto(url)
                    page.get_by_text(f'{outcome.title()} recorded.', exact=True).wait_for()

                for key, (outcome, _, _, _) in captured.items():
                    url = ORIGIN + key
                    html = (FIXTURE.parent / f'{key}.html').read_text(encoding='utf-8')
                    browser.route(url, fixture_response(html))
                    page.goto(url)
                    page.get_by_text(f'{outcome.title()} recorded.', exact=True).wait_for()

                page.reload()
                page.get_by_text('This match was already processed.', exact=True).wait_for()
                page.goto(popup)
                page.get_by_text(f'{total_matches} matches seen', exact=True).wait_for()
                with page.expect_download() as download:
                    page.get_by_role('button', name='Export Match History').click()

                recent = page.locator('#recentMatches li').all_text_contents()
                export_file = download.value.path()
                page.goto((ROOT / 'demo.html').as_uri())
                page.locator('#openHistory').set_input_files(export_file)
                page.get_by_text(f'Showing {total_matches} matches from the local export.', exact=True).wait_for()
                self.assertEqual(page.locator('#recentMatches li').all_text_contents(), recent)
                payload = json.loads(export_file.read_text(encoding='utf-8'))
                self.assertEqual(payload['schemaVersion'], 1)
                self.assertEqual(len(payload['matches']), total_matches)
                actual = {match['id']: match for match in payload['matches']}
                for outcome, score in cases.items():
                    match = actual[outcome]
                    self.assertEqual((match['playerScore'], match['opponentScore']), score)
                    self.assertEqual([hero['hero'] for hero in match['heroes']], ['Magneto', 'Luna Snow'])
                    self.assertTrue(all(hero['weight'] == 1.2 for hero in match['heroes']))
                    self.assertNotIn('player', match)

                for key, (outcome, player_score, opponent_score, hero_count) in captured.items():
                    match = actual[key]
                    self.assertEqual(match['outcome'], outcome)
                    self.assertEqual((match['playerScore'], match['opponentScore']), (player_score, opponent_score))
                    self.assertEqual(len(match['heroes']), hero_count)
                    self.assertNotIn('player', match)
            finally:
                browser.close()
