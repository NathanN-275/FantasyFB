# Fantasy Football Calculator ADP

Reviewed: 2026-07-25

## Authorization and use

Fantasy Football Calculator documents its ADP JSON REST API as free for personal and commercial
use and requests attribution by link or mention:

- <https://help.fantasyfootballcalculator.com/article/42-adp-rest-api>
- <https://help.fantasyfootballcalculator.com/article/34-average-draft-position-adp-data>

The provider asks clients not to call frequently because the data updates once per day. FantasyFB
therefore exposes a deliberate snapshot action and documents a once-daily maximum per season,
scoring format, and league size. The workspace and stored data attribution link back to Fantasy
Football Calculator.

## Coverage and normalization

The official endpoint accepts scoring format, team count, and year. The provider currently
documents standard, Half-PPR, PPR, 2-QB, Dynasty, and Rookie data, with historical coverage back to 2007.

FantasyFB stores each response as a new dataset version. It retains:

- provider;
- scoring format;
- league size;
- season;
- overall ADP;
- positional ADP derived from the overall ordering within each position;
- high pick as minimum pick;
- low pick as maximum pick;
- player-level draft count as sample size when present;
- retrieval timestamp.

The source player ID is resolved through the canonical external-ID registry first, then by the
normalized name, team, and position. Ambiguous or missing players are reported and excluded from the
stored snapshot.
