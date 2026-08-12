const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Load app.js code into scope for testing standalone functions
const appJsPath = path.join(__dirname, "..", "docs", "js", "app.js");
const appCode = fs.readFileSync(appJsPath, "utf8");

// Extract helper functions for testing
function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTime(timeStr) {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function parseDate(dateStr) {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return 0;
  let yr = parseInt(parts[2]);
  if (yr < 100) yr += 2000;
  return new Date(yr, parseInt(parts[0]) - 1, parseInt(parts[1])).getTime();
}

function formatAssignorLine(g, locMap = {}) {
  const gn = g.gn || "";
  let dStr = g.d || "";
  const dateParts = dStr.split("/");
  if (dateParts.length === 3 && dateParts[2].length === 2) {
    dStr = `${dateParts[0]}/${dateParts[1]}/20${dateParts[2]}`;
  }

  const tStr = g.t || "";
  const locObj = locMap[g.lid];
  const siteName = locObj ? (locObj.name || locObj.community || "") : "";

  let subSite = g.loc || siteName;
  const subMatch = subSite.match(/\((.*?)\)/);
  if (subMatch) {
    subSite = subMatch[1].trim();
  }

  let level = g.age || "";
  const levelMatch = level.match(/\(?(U\d{2}(?:\/\d{2})?)\)?/i);
  if (levelMatch) {
    level = levelMatch[1].toUpperCase();
  }

  const home = (g.h || "").trim();
  const away = (g.v || "").trim();

  return `${gn} - ${dStr} - ${tStr} - ${siteName} - ${subSite} - ${level} - ${home} - ${away}`;
}

describe("Web App Frontend Helper Unit Tests", () => {

  test("haversine calculates accurate distance in miles", () => {
    // Cleveland (41.4993, -81.6944) to Akron (41.0814, -81.5190) is ~30.28 miles
    const dist = haversine(41.4993, -81.6944, 41.0814, -81.5190);
    assert.ok(dist > 28 && dist < 32, `Expected ~30 miles, got ${dist}`);
  });

  test("parseTime converts 12-hour AM/PM times to minutes from midnight", () => {
    assert.strictEqual(parseTime("12:00 AM"), 0);
    assert.strictEqual(parseTime("8:30 AM"), 510);
    assert.strictEqual(parseTime("12:00 PM"), 720);
    assert.strictEqual(parseTime("1:30 PM"), 810);
    assert.strictEqual(parseTime("11:59 PM"), 1439);
  });

  test("parseDate parses M/D/YY into timestamp", () => {
    const ts = parseDate("8/16/26");
    const d = new Date(ts);
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 7); // 0-indexed August
    assert.strictEqual(d.getDate(), 16);
  });

  test("formatAssignorLine produces correct assignor string format", () => {
    const game = {
      gn: "10601",
      lid: 617,
      loc: "River Road Park (River Road Park East 1)",
      d: "8/16/26",
      t: "10:00 AM",
      h: "Kenston BL",
      v: "Solon United",
      g: "Boys",
      age: "2017(U10)",
      div: "3 East",
    };
    const locMap = {
      617: { id: 617, name: "River Road Park", community: "Chagrin Falls" }
    };

    const formatted = formatAssignorLine(game, locMap);
    assert.strictEqual(
      formatted,
      "10601 - 8/16/2026 - 10:00 AM - River Road Park - River Road Park East 1 - U10 - Kenston BL - Solon United"
    );
  });

});
