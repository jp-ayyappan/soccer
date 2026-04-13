/* ── OHTSL Game Finder ────────────────────────────────────── */

(() => {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let seasons = [];
  let currentSeason = null;   // { id, label }
  let locations = [];         // venue array
  let games = [];             // game array
  let locMap = {};            // location_id -> location obj

  let selectedDate = "";      // "" = all dates
  let selectedVenue = null;   // location_id or null
  let userLatLng = null;      // [lat, lng] from ZIP geocode
  let radiusMiles = 20;

  let map = null;
  let markers = [];           // leaflet marker refs

  // Northern Ohio default center
  const DEFAULT_CENTER = [41.4, -81.7];
  const DEFAULT_ZOOM = 9;

  // ── DOM refs ───────────────────────────────────────────────
  const $breadcrumb = document.getElementById("breadcrumb");
  const $filterBar = document.getElementById("filter-bar");
  const $seasonPicker = document.getElementById("season-picker");
  const $seasonList = document.getElementById("season-list");
  const $mapContainer = document.getElementById("map-container");
  const $dateSelect = document.getElementById("date-select");
  const $zipInput = document.getElementById("zip-input");
  const $radiusSelect = document.getElementById("radius-select");
  const $applyBtn = document.getElementById("apply-filters");
  const $detailPanel = document.getElementById("detail-panel");
  const $detailTitle = document.getElementById("detail-title");
  const $detailAddress = document.getElementById("detail-address");
  const $detailGames = document.getElementById("detail-games");
  const $detailClose = document.getElementById("detail-close");

  // ── Haversine distance (miles) ─────────────────────────────
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Data loading ───────────────────────────────────────────
  async function fetchJSON(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load ${url}`);
    return resp.json();
  }

  async function loadSeasons() {
    seasons = await fetchJSON("data/seasons.json");
    renderSeasonPicker();
  }

  async function loadSeasonData(seasonId) {
    const [locs, gms] = await Promise.all([
      fetchJSON(`data/${seasonId}/locations.json`),
      fetchJSON(`data/${seasonId}/games.json`),
    ]);
    locations = locs;
    games = gms;
    locMap = {};
    locations.forEach(l => { locMap[l.id] = l; });
  }

  // ── Breadcrumb ─────────────────────────────────────────────
  function renderBreadcrumb() {
    const crumbs = [];

    // Level 0: All Seasons
    crumbs.push({ label: "All Seasons", action: navToSeasons });

    // Level 1: Season
    if (currentSeason) {
      crumbs.push({ label: currentSeason.label, action: () => navToSeason(currentSeason) });
    }

    // Level 2: Date
    if (selectedDate) {
      const dateLabel = formatDateLabel(selectedDate);
      crumbs.push({ label: dateLabel, action: null }); // active
    }

    // Level 3: Venue
    if (selectedVenue) {
      const loc = locMap[selectedVenue];
      const venueName = loc ? loc.name : `Venue ${selectedVenue}`;
      crumbs.push({ label: venueName, action: null }); // active
    }

    $breadcrumb.innerHTML = "";
    crumbs.forEach((c, i) => {
      if (i > 0) {
        const sep = document.createElement("span");
        sep.className = "sep";
        sep.textContent = "›";
        $breadcrumb.appendChild(sep);
      }
      const span = document.createElement("span");
      span.className = "crumb" + (i === crumbs.length - 1 ? " active" : "");
      span.textContent = c.label;
      if (i < crumbs.length - 1 && c.action) {
        span.addEventListener("click", c.action);
      }
      $breadcrumb.appendChild(span);
    });
  }

  // ── Navigation ─────────────────────────────────────────────
  function navToSeasons() {
    currentSeason = null;
    selectedDate = "";
    selectedVenue = null;
    closeDetail();
    $filterBar.classList.add("hidden");
    $mapContainer.classList.add("hidden");
    $seasonPicker.classList.remove("hidden");
    renderBreadcrumb();
  }

  async function navToSeason(season) {
    currentSeason = season;
    selectedDate = "";
    selectedVenue = null;
    closeDetail();

    $seasonPicker.classList.add("hidden");
    $filterBar.classList.remove("hidden");
    $mapContainer.classList.remove("hidden");

    await loadSeasonData(season.id);
    populateDateDropdown();
    initMap();
    renderMarkers();
    renderBreadcrumb();
  }

  // ── Season picker ──────────────────────────────────────────
  function renderSeasonPicker() {
    $seasonList.innerHTML = "";
    seasons.forEach(s => {
      const card = document.createElement("div");
      card.className = "season-card";
      card.textContent = s.label;
      card.addEventListener("click", () => navToSeason(s));
      $seasonList.appendChild(card);
    });
  }

  // ── Date dropdown ──────────────────────────────────────────
  function populateDateDropdown() {
    // Extract unique dates, sorted chronologically
    const dateSet = new Set();
    games.forEach(g => { if (g.d) dateSet.add(g.d); });
    const dates = [...dateSet].sort((a, b) => parseDate(a) - parseDate(b));

    $dateSelect.innerHTML = '<option value="">All dates</option>';
    dates.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      // Find the day name from any game with this date
      const sample = games.find(g => g.d === d);
      opt.textContent = sample ? `${sample.day} ${d}` : d;
      $dateSelect.appendChild(opt);
    });
  }

  function parseDate(dateStr) {
    // "4/12/26" -> Date
    const parts = dateStr.split("/");
    if (parts.length !== 3) return new Date(0);
    const year = parseInt(parts[2]) + 2000;
    return new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
  }

  function formatDateLabel(dateStr) {
    const d = parseDate(dateStr);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
  }

  // ── Map ────────────────────────────────────────────────────
  function initMap() {
    if (map) {
      map.remove();
    }
    map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    // Resize fix for hidden container
    setTimeout(() => map.invalidateSize(), 100);
  }

  function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
  }

  function renderMarkers() {
    if (!map) return;
    clearMarkers();

    // Build game count per location_id for current filters
    const filteredGames = getFilteredGames();
    const countByLoc = {};
    filteredGames.forEach(g => {
      countByLoc[g.lid] = (countByLoc[g.lid] || 0) + 1;
    });

    // Filter locations by distance if user set a ZIP
    const visibleLocs = locations.filter(loc => {
      if (!countByLoc[loc.id] && selectedDate) return false; // hide zero-game venues when date filtered
      if (userLatLng && radiusMiles > 0) {
        const dist = haversine(userLatLng[0], userLatLng[1], loc.lat, loc.lng);
        return dist <= radiusMiles;
      }
      return true;
    });

    const bounds = [];

    visibleLocs.forEach(loc => {
      const count = countByLoc[loc.id] || 0;
      const size = count === 0 ? 20 : Math.min(20 + count * 1.5, 44);

      const icon = L.divIcon({
        className: "marker-label",
        html: `<span>${count}</span>`,
        iconSize: [size, size],
      });

      const marker = L.marker([loc.lat, loc.lng], { icon })
        .addTo(map)
        .on("click", () => openVenueDetail(loc.id));

      // Tooltip on hover
      marker.bindTooltip(`${loc.name}<br>${loc.city}, ${loc.state}`, {
        direction: "top", offset: [0, -size / 2],
      });

      markers.push(marker);
      bounds.push([loc.lat, loc.lng]);
    });

    // Fit bounds
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }

  function getFilteredGames() {
    let filtered = games;
    if (selectedDate) {
      filtered = filtered.filter(g => g.d === selectedDate);
    }
    return filtered;
  }

  // ── ZIP geocoding ──────────────────────────────────────────
  async function geocodeZip(zip) {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "OHTSLGameFinder/1.0" },
      });
      const data = await resp.json();
      if (data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) {
      console.warn("Geocoding failed:", e);
    }
    return null;
  }

  // ── Venue detail panel ─────────────────────────────────────
  function openVenueDetail(locId) {
    selectedVenue = locId;
    const loc = locMap[locId];
    if (!loc) return;

    $detailTitle.textContent = loc.name;
    const addrParts = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean);
    $detailAddress.textContent = addrParts.join(", ");

    // Get games for this venue
    let venueGames = games.filter(g => g.lid === locId);
    if (selectedDate) {
      venueGames = venueGames.filter(g => g.d === selectedDate);
    }

    // Sort by date then time
    venueGames.sort((a, b) => {
      const da = parseDate(a.d), db = parseDate(b.d);
      if (da - db !== 0) return da - db;
      return parseTime(a.t) - parseTime(b.t);
    });

    // Render grouped by date
    $detailGames.innerHTML = "";
    let currentDate = "";
    venueGames.forEach(g => {
      if (g.d !== currentDate) {
        currentDate = g.d;
        const header = document.createElement("div");
        header.className = "game-date-header";
        header.textContent = `${g.day} ${g.d}`;
        $detailGames.appendChild(header);
      }

      const row = document.createElement("div");
      row.className = "game-row";
      row.innerHTML = `
        <span class="time">${g.t}</span>
        <span class="game-num">#${g.gn}</span>
        <span class="teams">${g.h} vs ${g.v}</span>
        <span class="meta">${g.g} ${g.age} ${g.div}</span>
        <span class="field">${g.loc}</span>
      `;
      $detailGames.appendChild(row);
    });

    if (venueGames.length === 0) {
      $detailGames.innerHTML = '<p style="padding:12px;color:#888;">No games at this venue for the selected filters.</p>';
    }

    $detailPanel.classList.remove("hidden");
    renderBreadcrumb();
  }

  function closeDetail() {
    selectedVenue = null;
    $detailPanel.classList.add("hidden");
    renderBreadcrumb();
  }

  function parseTime(timeStr) {
    // "2:30 PM" -> minutes since midnight
    const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const ampm = m[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }

  // ── Event handlers ─────────────────────────────────────────
  $applyBtn.addEventListener("click", async () => {
    const zip = $zipInput.value.trim();
    radiusMiles = parseInt($radiusSelect.value) || 0;
    selectedDate = $dateSelect.value;
    selectedVenue = null;
    closeDetail();

    if (zip.length === 5) {
      $applyBtn.textContent = "...";
      userLatLng = await geocodeZip(zip);
      $applyBtn.textContent = "Apply";
    } else if (!zip) {
      userLatLng = null;
    }

    renderMarkers();
    renderBreadcrumb();
  });

  $dateSelect.addEventListener("change", () => {
    selectedDate = $dateSelect.value;
    selectedVenue = null;
    closeDetail();
    renderMarkers();
    renderBreadcrumb();
  });

  $detailClose.addEventListener("click", closeDetail);

  // Allow Enter key on ZIP input to trigger apply
  $zipInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $applyBtn.click();
  });

  // ── Init ───────────────────────────────────────────────────
  loadSeasons().catch(err => {
    console.error("Failed to load seasons:", err);
    $seasonList.innerHTML = '<p style="color:red;">Failed to load season data.</p>';
  });

})();
