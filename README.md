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

## Requirements

- Python 3.9+
- `requests`
- `beautifulsoup4`

```bash
pip install requests beautifulsoup4
```

## Usage

The season is **auto-detected** from today's date (Apr–Aug = Spring, Sep–Mar = Fall), so you can usually just run:

```bash
python3 scrape_ohtsl.py
```

To explicitly target a season:

```bash
python3 scrape_ohtsl.py --season fall --year 2026
python3 scrape_ohtsl.py --season spring --year 2027
```

To see what you've already scraped:

```bash
python3 scrape_ohtsl.py --list
```

Re-run anytime to pick up reschedules — the output files for that season will be overwritten with fresh data.

## How It Works

1. Fetches division listings from `ohtsl.com/public.php` for Boys and Girls
2. For each division, calls the internal AJAX endpoint (`core/getgames.php`) to retrieve the game schedule HTML
3. Parses game details: teams, date, time, location, game number
4. Groups and sorts the data, then writes the output files
