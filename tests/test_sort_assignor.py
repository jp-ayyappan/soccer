import os
import shutil
import tempfile
import unittest
from sort_assignor import parse_and_sort


class TestSortAssignor(unittest.TestCase):
    def test_parse_and_sort(self):
        tmpdir = tempfile.mkdtemp()
        try:
            in_file = os.path.join(tmpdir, "input.tsv")
            out_file = os.path.join(tmpdir, "output.txt")
            with open(in_file, "w", encoding="utf-8") as f:
                f.write("gender\tage\tbracket\tGAME #\thome\tvisitor\tday\tdate\ttime\tlocation\tfield\treferee\n")
                f.write("Boys\tU10\t3 East\t10601\tKenston BL\tSolon United\tSun\t8/16/2026\t10:00 AM\tRiver Road Park\tEast 1\tRef 1\n")

            parse_and_sort(in_file, out_file)
            self.assertTrue(os.path.exists(out_file))

            with open(out_file, encoding="utf-8") as f:
                content = f.read()
                self.assertIn("River Road Park", content)
                self.assertIn("10601", content)
        finally:
            shutil.rmtree(tmpdir)


if __name__ == "__main__":
    unittest.main()
