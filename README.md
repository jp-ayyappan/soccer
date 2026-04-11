# OHTSL Game Schedule Scraper

Scrapes game schedules from the [Ohio Travel Soccer League](https://www.ohtsl.com) website and organizes them for referee scheduling.

## Purpose

Extracts all scheduled games across every division (Boys & Girls, U09–U15) and produces reports **grouped by location** and **sorted by date/time** — making it easy to find back-to-back games at the same venue to maximize referee earning potential.

## Output

The scraper generates three files inside a season directory (e.g. `Spring_2026/`):

- **`all_games.csv`** — Flat CSV of every game, sorted by location then date/time. Easy to filter/sort in a spreadsheet.
- **`games_by_location.txt`** — Human-readable report grouped by venue, with games sorted chronologically within each venue.
- **`games_by_date_and_location.txt`** — Organized by date first, then by venue within each date. Best for day-of planning to spot back-to-back opportunities.

Each venue entry includes a direct link to the OHTSL map/directions page.

After scraping, a summary is printed to the console showing total games, unique venues, and the **top 15 venues by game count** — the best candidates for scheduling back-to-back games.

## Spring 2026 Stats

- **4,140 games** across **381 venues**
- 81 Boys divisions + 58 Girls divisions (U09–U15)
- Season runs April 12 – June 7, 2026

## Re-running

Re-run the scraper anytime to pick up reschedules or score updates:

```bash
python3 scrape_ohtsl.py
```

The output files in `Spring_2026/` will be overwritten with fresh data.

## Requirements

- Python 3.9+
- `requests`
- `beautifulsoup4`

```bash
pip install requests beautifulsoup4
```

## Usage

```bash
# Default (Spring 2026)
python3 scrape_ohtsl.py

# Specify a different season name
python3 scrape_ohtsl.py --season Fall_2026
```

## How It Works

1. Fetches division listings from `ohtsl.com/public.php` for Boys and Girls
2. For each division, calls the internal AJAX endpoint (`core/getgames.php`) to retrieve the game schedule HTML
3. Parses game details: teams, date, time, location, game number
4. Groups and sorts the data, then writes the output files
