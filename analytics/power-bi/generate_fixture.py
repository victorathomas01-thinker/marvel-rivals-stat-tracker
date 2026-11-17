"""Generate a repeatable, synthetic version 1 match-history export."""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import random

SEED = 20261117
MATCHES = 360
HEROES = ('Storm', 'Magneto', 'Luna Snow', 'Hulk', 'Groot', 'Rocket Raccoon',
          'Mantis', 'Iron Man', 'Hela', 'Venom', 'Thor', 'Peni Parker')


def generate():
    random_source = random.Random(SEED)
    matches = []
    start = datetime(2026, 8, 1, 18, tzinfo=timezone.utc)
    for index in range(MATCHES):
        # Outcomes are independent of selected heroes. All patterns are simulated.
        outcome = random_source.choices(('win', 'loss', 'draw'), weights=(48, 47, 5))[0]
        selected = random_source.sample(HEROES, random_source.randint(6, 8))
        entries = []
        for hero in selected:
            has_award = random_source.random() < 0.15
            entries.append(dict(hero=hero, weight=1.2 if has_award else 1, hasAward=has_award))
        if index % 11 == 0:
            # A repeated appearance must count once in hero encounter rates.
            entries.append(dict(entries[0]))
        recorded = start + timedelta(hours=index * 6)
        player_score, opponent_score = {
            'win': (2, random_source.choice((0, 1))),
            'loss': (random_source.choice((0, 1)), 2),
            'draw': (1, 1),
        }[outcome]
        matches.append(dict(
            id=f'synthetic-{index + 1:04d}', outcome=outcome,
            recordedAt=None if index % 29 == 0 else recorded.isoformat().replace('+00:00', 'Z'),
            playerScore=None if index % 37 == 0 else player_score,
            opponentScore=None if index % 37 == 0 else opponent_score,
            heroes=entries,
        ))
    return dict(schemaVersion=1, matches=matches)


def main():
    destination = Path(__file__).resolve().parent / 'data'
    destination.mkdir(exist_ok=True)
    export = generate()
    (destination / 'synthetic-match-history.json').write_text(
        json.dumps(export, indent=2) + '\n', encoding='utf-8')
    metadata = dict(
        synthetic=True, seed=SEED, matches=MATCHES,
        outcomes={outcome: sum(match['outcome'] == outcome for match in export['matches'])
                  for outcome in ('win', 'loss', 'draw')},
        missing_recorded_at=sum(match['recordedAt'] is None for match in export['matches']),
        missing_scores=sum(match['playerScore'] is None for match in export['matches']),
        repeated_hero_rows=sum(len(match['heroes']) - len({hero['hero'] for hero in match['heroes']})
                              for match in export['matches']),
    )
    (destination / 'fixture-metadata.json').write_text(
        json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
