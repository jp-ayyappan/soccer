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

  const selectedGames = new Map(); // gn -> game object
  let currentVenueGames = [];      // currently rendered games in detail panel
  let currentSort = "time";        // "time", "location", "location_time", "time_location"

  // Northern Ohio default center
  const DEFAULT_CENTER = [41.4, -81.7];
  const DEFAULT_ZOOM = 9;

  // ── DOM refs ───────────────────────────────────────────────
  const $breadcrumb = document.getElementById("breadcrumb");
  const $filterBar = document.getElementById("filter-bar");
  const $seasonPicker = document.getElementById("season-picker");
  const $seasonList = document.getElementById("season-list");
  const $mainContent = document.getElementById("main-content");
  const $mapContainer = document.getElementById("map-container");
  const $dateSelect = document.getElementById("date-select");
  const $zipInput = document.getElementById("zip-input");
  const $useLocationBtn = document.getElementById("use-location-btn");
  const $radiusSelect = document.getElementById("radius-select");
  const $applyBtn = document.getElementById("apply-filters");

  const $resultsPanel = document.getElementById("results-panel");
  const $resultsTitle = document.getElementById("results-title");
  const $resultsCount = document.getElementById("results-count");
  const $sortSelect = document.getElementById("sort-select");
  const $selectAllResults = document.getElementById("select-all-results");
  const $resultsList = document.getElementById("results-list");

  const $detailPanel = document.getElementById("detail-panel");
  const $detailTitle = document.getElementById("detail-title");
  const $detailAddress = document.getElementById("detail-address");
  const $detailGames = document.getElementById("detail-games");
  const $detailClose = document.getElementById("detail-close");
  const $selectAllVenueGames = document.getElementById("select-all-venue-games");

  const $selectionBar = document.getElementById("selection-bar");
  const $selectionCount = document.getElementById("selection-count");
  const $generateEmailBtn = document.getElementById("generate-email-btn");
  const $clearSelectionBtn = document.getElementById("clear-selection-btn");

  const $emailModal = document.getElementById("email-modal");
  const $modalClose = document.getElementById("modal-close");
  const $modalDismiss = document.getElementById("modal-dismiss");
  const $copyEmailBtn = document.getElementById("copy-email-btn");
  const $emailOutput = document.getElementById("email-output");

  const $viewToggle = document.getElementById("view-toggle");
  const $toggleMapBtn = document.getElementById("toggle-map-btn");
  const $toggleListBtn = document.getElementById("toggle-list-btn");
  const $listCountBadge = document.getElementById("list-count-badge");

  // ── Browser Geolocation ────────────────────────────────────
  function getUserLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    if ($useLocationBtn) $useLocationBtn.textContent = "⌛";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLatLng = [pos.coords.latitude, pos.coords.longitude];
        $zipInput.value = "GPS";
        if ($useLocationBtn) $useLocationBtn.textContent = "📍";
        renderMarkers();
        renderSearchResults();
        renderBreadcrumb();
      },
      (err) => {
        console.warn("Geolocation error:", err);
        if ($useLocationBtn) $useLocationBtn.textContent = "📍";
        alert("Could not access your location. Please check browser permissions or enter a ZIP code.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // ── Selection & Assignor Format Helpers ────────────────────
  function updateSelectionBar() {
    const count = selectedGames.size;
    if (count > 0) {
      $selectionCount.textContent = `${count} game${count === 1 ? "" : "s"} selected`;
      $selectionBar.classList.remove("hidden");
    } else {
      $selectionBar.classList.add("hidden");
    }
  }

  function clearSelection() {
    selectedGames.clear();
    if ($selectAllResults) $selectAllResults.checked = false;
    if ($selectAllVenueGames) $selectAllVenueGames.checked = false;
    document.querySelectorAll(".game-checkbox").forEach(cb => {
      cb.checked = false;
      const row = cb.closest(".game-row");
      if (row) row.classList.remove("selected");
    });
    updateSelectionBar();
  }

  function updateSelectAllVenueCheckbox() {
    if (!$selectAllVenueGames || !currentVenueGames || currentVenueGames.length === 0) {
      if ($selectAllVenueGames) $selectAllVenueGames.checked = false;
      return;
    }
    const allSelected = currentVenueGames.every(g => selectedGames.has(g.gn));
    $selectAllVenueGames.checked = allSelected;
  }

  function updateSelectAllResultsCheckbox() {
    if (!$selectAllResults) return;
    const filtered = getFilteredGames();
    if (filtered.length === 0) {
      $selectAllResults.checked = false;
      return;
    }
    $selectAllResults.checked = filtered.every(g => selectedGames.has(g.gn));
  }

  function formatAssignorLine(g) {
    // Format: GameID - Date - Time - SiteName - SubSiteName - LevelName - HomeTeams - AwayTeams
    const gn = g.gn || "";

    // Date: M/D/YY -> M/D/YYYY
    let dStr = g.d || "";
    const dateParts = dStr.split("/");
    if (dateParts.length === 3 && dateParts[2].length === 2) {
      dStr = `${dateParts[0]}/${dateParts[1]}/20${dateParts[2]}`;
    }

    const tStr = g.t || "";

    const locObj = locMap[g.lid];
    const siteName = locObj ? (locObj.name || locObj.community || "") : "";

    // SubSiteName from g.loc: e.g. "River Road Park (River Road Park East 1)" -> "River Road Park East 1"
    let subSite = g.loc || siteName;
    const subMatch = subSite.match(/\((.*?)\)/);
    if (subMatch) {
      subSite = subMatch[1].trim();
    }

    // LevelName: extract Uxx from g.age e.g. "2017(U10)" -> "U10"
    let level = g.age || "";
    const levelMatch = level.match(/\(?(U\d{2}(?:\/\d{2})?)\)?/i);
    if (levelMatch) {
      level = levelMatch[1].toUpperCase();
    }

    const home = (g.h || "").trim();
    const away = (g.v || "").trim();

    return `${gn} - ${dStr} - ${tStr} - ${siteName} - ${subSite} - ${level} - ${home} - ${away}`;
  }

  function generateAssignorText() {
    const sorted = sortGames([...selectedGames.values()], "time");
    return sorted.map(g => formatAssignorLine(g)).join("\n");
  }

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
    $mainContent.classList.add("hidden");
    $viewToggle.classList.add("hidden");
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
    $mainContent.classList.remove("hidden");
    $viewToggle.classList.remove("hidden");
    setMobileView("map");

    await loadSeasonData(season.id);
    populateDateDropdown();
    initMap();
    renderMarkers();
    renderSearchResults();
    renderBreadcrumb();
  }

  function setMobileView(viewMode) {
    if (viewMode === "map") {
      $mainContent.classList.add("show-map");
      $mainContent.classList.remove("show-list");
      $toggleMapBtn.classList.add("active");
      $toggleListBtn.classList.remove("active");
      if (map) setTimeout(() => map.invalidateSize(), 100);
    } else {
      $mainContent.classList.add("show-list");
      $mainContent.classList.remove("show-map");
      $toggleListBtn.classList.add("active");
      $toggleMapBtn.classList.remove("active");
    }
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
    const dateSet = new Set();
    games.forEach(g => { if (g.d) dateSet.add(g.d); });
    const dates = [...dateSet].sort((a, b) => parseDate(a) - parseDate(b));

    $dateSelect.innerHTML = '<option value="">All dates</option>';
    dates.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      const sample = games.find(g => g.d === d);
      opt.textContent = sample ? `${sample.day} ${d}` : d;
      $dateSelect.appendChild(opt);
    });
  }

  function parseDate(dateStr) {
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

    setTimeout(() => map.invalidateSize(), 100);
  }

  function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
  }

  function renderMarkers() {
    if (!map) return;
    clearMarkers();

    const filteredGames = getFilteredGames();
    const countByLoc = {};
    filteredGames.forEach(g => {
      countByLoc[g.lid] = (countByLoc[g.lid] || 0) + 1;
    });

    const visibleLocs = locations.filter(loc => {
      if (!countByLoc[loc.id] && selectedDate) return false;
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

      marker.bindTooltip(`${loc.name}<br>${loc.city}, ${loc.state}`, {
        direction: "top", offset: [0, -size / 2],
      });

      markers.push(marker);
      bounds.push([loc.lat, loc.lng]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }
  }

  function getFilteredGames() {
    let filtered = games;
    if (selectedDate) {
      filtered = filtered.filter(g => g.d === selectedDate);
    }
    if (userLatLng && radiusMiles > 0) {
      const allowedLocIds = new Set(
        locations
          .filter(loc => haversine(userLatLng[0], userLatLng[1], loc.lat, loc.lng) <= radiusMiles)
          .map(loc => loc.id)
      );
      filtered = filtered.filter(g => allowedLocIds.has(g.lid));
    }
    return filtered;
  }

  function sortGames(gamesList, sortMode) {
    const sorted = [...gamesList];
    sorted.sort((a, b) => {
      const da = parseDate(a.d), db = parseDate(b.d);
      const ta = parseTime(a.t), tb = parseTime(b.t);
      const loca = (locMap[a.lid] ? locMap[a.lid].name : a.loc) || "";
      const locb = (locMap[b.lid] ? locMap[b.lid].name : b.loc) || "";

      let dista = Infinity, distb = Infinity;
      if (userLatLng) {
        if (locMap[a.lid]) dista = haversine(userLatLng[0], userLatLng[1], locMap[a.lid].lat, locMap[a.lid].lng);
        if (locMap[b.lid]) distb = haversine(userLatLng[0], userLatLng[1], locMap[b.lid].lat, locMap[b.lid].lng);
      }

      if (sortMode === "location" || sortMode === "location_time") {
        if (userLatLng && dista !== distb) {
          return dista - distb;
        }
        const locComp = loca.localeCompare(locb);
        if (locComp !== 0) return locComp;
        if (da - db !== 0) return da - db;
        return ta - tb;
      } else if (sortMode === "time_location") {
        if (da - db !== 0) return da - db;
        if (ta - tb !== 0) return ta - tb;
        if (userLatLng && dista !== distb) {
          return dista - distb;
        }
        return loca.localeCompare(locb);
      } else {
        // Default "time": Start Time across all locations
        if (da - db !== 0) return da - db;
        if (ta - tb !== 0) return ta - tb;
        if (userLatLng && dista !== distb) {
          return dista - distb;
        }
        const locComp = loca.localeCompare(locb);
        if (locComp !== 0) return locComp;
        return (parseInt(a.gn) || 0) - (parseInt(b.gn) || 0);
      }
    });
    return sorted;
  }

  function renderSearchResults() {
    const filtered = getFilteredGames();
    const sorted = sortGames(filtered, currentSort);

    $resultsCount.textContent = `${sorted.length} game${sorted.length === 1 ? "" : "s"}`;
    $listCountBadge.textContent = sorted.length;
    updateSelectAllResultsCheckbox();

    $resultsList.innerHTML = "";

    if (sorted.length === 0) {
      $resultsList.innerHTML = '<p style="padding:20px;color:#888;text-align:center;">No games match your active filters.</p>';
      return;
    }

    let currentGroupHeader = "";
    sorted.forEach(g => {
      const locObj = locMap[g.lid];
      const venueName = locObj ? locObj.name : g.loc;

      let distBadge = "";
      if (userLatLng && locObj) {
        const dMiles = haversine(userLatLng[0], userLatLng[1], locObj.lat, locObj.lng);
        distBadge = ` (${dMiles.toFixed(1)} mi away)`;
      }

      let groupHeader = "";
      if (currentSort === "location" || currentSort === "location_time") {
        groupHeader = `📍 ${venueName}${distBadge}`;
      } else {
        groupHeader = `🗓 ${g.day} ${g.d}`;
      }

      if (groupHeader !== currentGroupHeader) {
        currentGroupHeader = groupHeader;
        const headerEl = document.createElement("div");
        headerEl.className = "game-date-header";
        headerEl.textContent = groupHeader;
        $resultsList.appendChild(headerEl);
      }

      const isSelected = selectedGames.has(g.gn);

      const row = document.createElement("div");
      row.className = "game-row" + (isSelected ? " selected" : "");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "game-checkbox";
      checkbox.checked = isSelected;
      checkbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        if (checked) {
          selectedGames.set(g.gn, g);
          row.classList.add("selected");
        } else {
          selectedGames.delete(g.gn);
          row.classList.remove("selected");
        }
        updateSelectionBar();
        updateSelectAllResultsCheckbox();
        updateSelectAllVenueCheckbox();
      });

      row.appendChild(checkbox);

      const rowContent = document.createElement("div");
      rowContent.style.display = "contents";
      rowContent.innerHTML = `
        <span class="time">${g.t}</span>
        <span class="game-num">#${g.gn}</span>
        <span class="teams">${g.h} vs ${g.v}</span>
        <span class="meta">${g.g} ${g.age} ${g.div}</span>
        <span class="field"><span class="result-venue-tag">${venueName}${distBadge}</span> ${g.loc}</span>
      `;
      row.appendChild(rowContent);

      $resultsList.appendChild(row);
    });
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

    let venueGames = games.filter(g => g.lid === locId);
    if (selectedDate) {
      venueGames = venueGames.filter(g => g.d === selectedDate);
    }

    venueGames.sort((a, b) => {
      const da = parseDate(a.d), db = parseDate(b.d);
      if (da - db !== 0) return da - db;
      return parseTime(a.t) - parseTime(b.t);
    });

    currentVenueGames = venueGames;
    updateSelectAllVenueCheckbox();

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

      const isSelected = selectedGames.has(g.gn);

      const row = document.createElement("div");
      row.className = "game-row" + (isSelected ? " selected" : "");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "game-checkbox";
      checkbox.checked = isSelected;
      checkbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        if (checked) {
          selectedGames.set(g.gn, g);
          row.classList.add("selected");
        } else {
          selectedGames.delete(g.gn);
          row.classList.remove("selected");
        }
        updateSelectionBar();
        updateSelectAllVenueCheckbox();
        updateSelectAllResultsCheckbox();
      });

      row.appendChild(checkbox);

      const rowContent = document.createElement("div");
      rowContent.style.display = "contents";
      rowContent.innerHTML = `
        <span class="time">${g.t}</span>
        <span class="game-num">#${g.gn}</span>
        <span class="teams">${g.h} vs ${g.v}</span>
        <span class="meta">${g.g} ${g.age} ${g.div}</span>
        <span class="field">${g.loc}</span>
      `;
      row.appendChild(rowContent);

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
    currentVenueGames = [];
    $detailPanel.classList.add("hidden");
    renderBreadcrumb();
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
    renderSearchResults();
    renderBreadcrumb();
  });

  if ($useLocationBtn) {
    $useLocationBtn.addEventListener("click", getUserLocation);
  }

  $dateSelect.addEventListener("change", () => {
    selectedDate = $dateSelect.value;
    selectedVenue = null;
    closeDetail();
    renderMarkers();
    renderSearchResults();
    renderBreadcrumb();
  });

  $sortSelect.addEventListener("change", () => {
    currentSort = $sortSelect.value;
    renderSearchResults();
  });

  $toggleMapBtn.addEventListener("click", () => setMobileView("map"));
  $toggleListBtn.addEventListener("click", () => setMobileView("list"));

  $detailClose.addEventListener("click", closeDetail);

  $zipInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $applyBtn.click();
  });

  if ($selectAllResults) {
    $selectAllResults.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      const filtered = getFilteredGames();
      filtered.forEach(g => {
        if (isChecked) {
          selectedGames.set(g.gn, g);
        } else {
          selectedGames.delete(g.gn);
        }
      });
      renderSearchResults();
      if (selectedVenue) openVenueDetail(selectedVenue);
      updateSelectionBar();
    });
  }

  if ($selectAllVenueGames) {
    $selectAllVenueGames.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      currentVenueGames.forEach(g => {
        if (isChecked) {
          selectedGames.set(g.gn, g);
        } else {
          selectedGames.delete(g.gn);
        }
      });
      renderSearchResults();
      if (selectedVenue) openVenueDetail(selectedVenue);
      updateSelectionBar();
    });
  }

  $generateEmailBtn.addEventListener("click", () => {
    const text = generateAssignorText();
    $emailOutput.value = text;
    $emailModal.classList.remove("hidden");
  });

  $clearSelectionBtn.addEventListener("click", () => {
    clearSelection();
    renderSearchResults();
    if (selectedVenue) openVenueDetail(selectedVenue);
  });

  $modalClose.addEventListener("click", () => $emailModal.classList.add("hidden"));
  $modalDismiss.addEventListener("click", () => $emailModal.classList.add("hidden"));

  $copyEmailBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($emailOutput.value);
      const origText = $copyEmailBtn.textContent;
      $copyEmailBtn.textContent = "Copied!";
      setTimeout(() => { $copyEmailBtn.textContent = origText; }, 2000);
    } catch (e) {
      $emailOutput.select();
      document.execCommand("copy");
    }
  });

  // ── Init ───────────────────────────────────────────────────
  loadSeasons().catch(err => {
    console.error("Failed to load seasons:", err);
    $seasonList.innerHTML = '<p style="color:red;">Failed to load season data.</p>';
  });

})();
