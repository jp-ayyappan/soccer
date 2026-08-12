import os
import shutil
import tempfile
import unittest
from build_site_data import (
    build_locations_json,
    build_games_json,
)


class TestBuildSiteData(unittest.TestCase):
    def test_build_locations_json(self):
        """Verify building locations JSON from CSV."""
        tmpdir = tempfile.mkdtemp()
        try:
            loc_csv = os.path.join(tmpdir, "locations.csv")
            with open(loc_csv, "w", encoding="utf-8") as f:
                f.write("location_id,field_name,community,address,city,state,zip,latitude,longitude,game_count\n")
                f.write("617,River Road Park,Chagrin Falls,3000 River Rd,Willoughby,OH,44094,41.39,-81.38,10\n")
                f.write("999,No Coords Park,Solon,123 Main,Solon,OH,44139,,,5\n")

            locs = build_locations_json(loc_csv)
            self.assertEqual(len(locs), 1)
            self.assertEqual(locs[0]["id"], 617)
            self.assertEqual(locs[0]["name"], "River Road Park")
            self.assertEqual(locs[0]["lat"], 41.39)
            self.assertEqual(locs[0]["lng"], -81.38)
        finally:
            shutil.rmtree(tmpdir)

    def test_build_games_json(self):
        """Verify building games JSON from CSV."""
        tmpdir = tempfile.mkdtemp()
        try:
            games_csv = os.path.join(tmpdir, "all_games.csv")
            with open(games_csv, "w", encoding="utf-8") as f:
                f.write("location,date,day,time,game_number,location_id,home_team,visitor_team,gender,age_group,division_name\n")
                f.write("River Road Park (East 1),8/16/26,Sun,10:00 AM,10601,617,Kenston BL,Solon United,Boys,2017(U10),3 East\n")

            gms = build_games_json(games_csv)
            self.assertEqual(len(gms), 1)
            self.assertEqual(gms[0]["gn"], "10601")
            self.assertEqual(gms[0]["lid"], 617)
            self.assertEqual(gms[0]["h"], "Kenston BL")
            self.assertEqual(gms[0]["v"], "Solon United")
        finally:
            shutil.rmtree(tmpdir)


if __name__ == "__main__":
    unittest.main()
