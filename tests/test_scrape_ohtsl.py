import os
import shutil
import tempfile
import unittest
from scrape_ohtsl import (
    detect_season,
    infer_season_from_games,
    detect_schedule_changes,
)


class TestScrapeOHTSL(unittest.TestCase):
    def test_detect_season_boundaries(self):
        """Verify season detection month boundaries."""
        term, year = detect_season()
        self.assertIn(term, ["Spring", "Fall"])
        self.assertGreater(year, 2020)

    def test_infer_season_from_games(self):
        """Verify inferring season directly from game dates."""
        fall_games = [
            {"date": "8/16/26"},
            {"date": "9/20/26"},
            {"date": "10/25/26"},
        ]
        term, year = infer_season_from_games(fall_games)
        self.assertEqual(term, "Fall")
        self.assertEqual(year, 2026)

        spring_games = [
            {"date": "4/15/26"},
            {"date": "5/20/26"},
            {"date": "6/10/26"},
        ]
        term_sp, year_sp = infer_season_from_games(spring_games)
        self.assertEqual(term_sp, "Spring")
        self.assertEqual(year_sp, 2026)

    def test_detect_schedule_changes_no_diff(self):
        """Verify 0 changes detected when scraped schedule matches existing CSV."""
        tmpdir = tempfile.mkdtemp()
        try:
            csv_path = os.path.join(tmpdir, "all_games.csv")
            with open(csv_path, "w", encoding="utf-8") as f:
                f.write("game_number,date,time,location,home_team,visitor_team,gender,age_group,division_name\n")
                f.write("10601,8/16/26,10:00 AM,River Road Park,Kenston BL,Solon United,Boys,2017(U10),3 East\n")

            games = [{
                "game_number": "10601",
                "date": "8/16/26",
                "time": "10:00 AM",
                "location": "River Road Park",
                "home_team": "Kenston BL",
                "visitor_team": "Solon United",
                "gender": "Boys",
                "age_group": "2017(U10)",
                "division_name": "3 East",
            }]

            detect_schedule_changes(games, tmpdir, "Fall 2026")
            reschedule_dir = os.path.join(tmpdir, "reschedules")
            self.assertFalse(os.path.exists(reschedule_dir))
        finally:
            shutil.rmtree(tmpdir)

    def test_detect_schedule_changes_with_reschedules(self):
        """Verify modification, addition, and removal detection."""
        tmpdir = tempfile.mkdtemp()
        try:
            csv_path = os.path.join(tmpdir, "all_games.csv")
            with open(csv_path, "w", encoding="utf-8") as f:
                f.write("game_number,date,time,location,home_team,visitor_team,gender,age_group,division_name\n")
                f.write("10601,8/16/26,10:00 AM,River Road Park,Kenston BL,Solon United,Boys,2017(U10),3 East\n")
                f.write("201,8/16/26,11:30 AM,River Road Park,Kenston,Shaker Hts. RED,Boys,2019(U08),East\n")

            new_games = [
                {"game_number": "10601", "date": "8/23/26", "time": "11:30 AM", "location": "Liberty Park", "home_team": "Kenston BL", "visitor_team": "Solon United", "gender": "Boys", "age_group": "2017(U10)", "division_name": "3 East"},
                {"game_number": "99999", "date": "9/1/26", "time": "1:00 PM", "location": "Walker Road Park", "home_team": "Hudson", "visitor_team": "Aurora", "gender": "Girls", "age_group": "2016(U11)", "division_name": "1"},
            ]

            detect_schedule_changes(new_games, tmpdir, "Fall 2026")
            reschedule_dir = os.path.join(tmpdir, "reschedules")
            self.assertTrue(os.path.exists(reschedule_dir))
            report_files = os.listdir(reschedule_dir)
            self.assertGreater(len(report_files), 0)

            with open(os.path.join(reschedule_dir, report_files[0]), encoding="utf-8") as f:
                content = f.read()
                self.assertIn("10601", content)
                self.assertIn("99999", content)
                self.assertIn("201", content)
        finally:
            shutil.rmtree(tmpdir)


if __name__ == "__main__":
    unittest.main()
