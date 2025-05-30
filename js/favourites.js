/**
 * Favorites Module
 * Handles favorites management, storage, and conflict detection
 */

import {state} from "./core.js";
import {
	saveToStorage,
	loadFromStorage,
	safeGetItem,
	safeSetItem,
	safeStorageAvailable,
} from "./storage.js";
import {timeToMinutes, formatTimeDisplay} from "./utils.js";
import {showDay, showDistrictXDay, showConflictAlert} from "./ui.js";

// Constants for storage
const FAVORITES_KEY = "downloadFestivalFavoriteSets";
const FAVORITES_FILTER_KEY = "downloadFestivalFavoritesFilter";

// Helper to generate a unique key for a set
function getSetKey(artist, day, stage, start) {
	return `${artist}|${day}|${stage}|${start}`;
}

// Helper to find if a set is favorited by a person
function isFavoriteBy(setKey, person = "You") {
	return state.favoriteSets.some(
		(fav) => fav.setKey === setKey && fav.person === person
	);
}

// Helper to get all people for a setKey
function getPeopleForSet(setKey) {
	return state.favoriteSets
		.filter((fav) => fav.setKey === setKey)
		.map((fav) => fav.person);
}

/**
 * Save the current favorites to storage
 */
export function saveFavorites() {
	if (!safeStorageAvailable()) {
		state.storageWarning = true;
		return;
	}
	try {
		safeSetItem(FAVORITES_KEY, JSON.stringify(state.favoriteSets));
		state.storageWarning = false;
	} catch {
		state.storageWarning = true;
	}
}

/**
 * Load favorites from storage
 */
export function loadFavorites() {
	if (!safeStorageAvailable()) {
		state.favoriteSets = [];
		state.favoriteArtists = [];
		state.storageWarning = true;
		return;
	}
	const favs = safeGetItem(FAVORITES_KEY);
	if (favs) {
		try {
			const arr = JSON.parse(favs);
			// Migrate old format if needed
			if (Array.isArray(arr) && typeof arr[0] === "string") {
				state.favoriteSets = arr.map((setKey) => ({
					setKey,
					person: "You",
				}));
			} else {
				state.favoriteSets = arr;
			}
		} catch {
			state.favoriteSets = [];
		}
	} else {
		state.favoriteSets = [];
	}
	state.favoriteArtists = [];
	state.storageWarning = false;

	// ADDED: Load favorites filter state
	const filterState = loadFromStorage(FAVORITES_FILTER_KEY);
	state.showFavoritesOnly = filterState === true;

	// Update toggle UI to match state
	const desktopToggle = document.getElementById(
		"global-favorites-toggle-desktop"
	);
	const mobileToggle = document.getElementById(
		"global-favorites-toggle-mobile"
	);

	if (desktopToggle) desktopToggle.checked = state.showFavoritesOnly;
	if (mobileToggle) mobileToggle.checked = state.showFavoritesOnly;

	// Make sure to re-render with current filter state
	showDay(state.currentDay);
	// If the current day is wednesday or thursday and districtX, show that day by default
	if (
		state.data.districtX &&
		state.data.districtX[state.districtXCurrentDay]
	) {
		showDistrictXDay(state.districtXCurrentDay || "wednesday");
		// Add active class to the correct District X day button
		setTimeout(() => {
			document.querySelectorAll(".districtx-day-btn").forEach((btn) => {
				if (
					btn.textContent.trim().toLowerCase() ===
					(state.districtXCurrentDay || "wednesday")
				) {
					btn.classList.add("active-btn");
					btn.classList.remove("bg-gray-700");
				} else {
					btn.classList.remove("active-btn");
					btn.classList.add("bg-gray-700");
				}
			});
		}, 0);
	}
}

/**
 * Toggle favorite status for a set (by setKey)
 * @param {string} setKey - Unique set key (artist|day|stage|start)
 * @param {Element} svg - SVG heart icon element (optional)
 */
export function toggleFavoriteSet(setKey, svg) {
	const idx = state.favoriteSets.findIndex(
		(fav) => fav.setKey === setKey && fav.person === "You"
	);
	if (idx !== -1) {
		if (svg) {
			svg.setAttribute("fill", "none");
			svg.setAttribute("stroke", "currentColor");
		}
		state.favoriteSets.splice(idx, 1);
	} else {
		// Check for conflicts before adding the new favorite
		const existingConflicts = checkForConflicts();

		// Add the favorite
		if (svg) {
			svg.setAttribute("fill", "#06b6d4");
			svg.setAttribute("stroke", "none");
		}
		state.favoriteSets.push({setKey, person: "You"});

		// Check for conflicts after adding the favorite
		const newConflicts = checkForConflicts();

		// Only show conflict alert if adding this artist created new conflicts
		if (newConflicts && newConflicts.length > existingConflicts.length) {
			// Find just the new conflicts to display
			const conflictsToShow = newConflicts.filter((conflict) => {
				// Check if this conflict involves the newly added artist
				const [artist, day, stage, start] = setKey.split("|");
				return (
					conflict.artist1 === artist || conflict.artist2 === artist
				);
			});

			if (conflictsToShow.length > 0) {
				showConflictAlert(conflictsToShow);
			}
		}
	}
	saveFavorites();
}

/**
 * Show or hide only favorite sets in the schedule
 */
export function showFavoritesOnly(show) {
	show = show === true;
	state.showFavoritesOnly = show;
	const desktopToggle = document.getElementById(
		"global-favorites-toggle-desktop"
	);
	const mobileToggle = document.getElementById(
		"global-favorites-toggle-mobile"
	);
	if (desktopToggle) desktopToggle.checked = show;
	if (mobileToggle) mobileToggle.checked = show;
	saveToStorage(FAVORITES_FILTER_KEY, show);
	// Hide/show set blocks by setKey
	const allSetBlocks = document.querySelectorAll(".set-block");
	if (show) {
		allSetBlocks.forEach((block) => {
			const setKey = block.dataset.setkey;
			if (
				setKey &&
				!state.favoriteSets.some((fav) => fav.setKey === setKey)
			) {
				block.style.display = "none";
			} else {
				block.style.display = "";
			}
		});
	} else {
		allSetBlocks.forEach((block) => {
			block.style.display = "";
		});
	}
	showDay(state.currentDay);
	if (
		state.data.districtX &&
		state.data.districtX[state.districtXCurrentDay]
	) {
		showDistrictXDay(state.districtXCurrentDay);
	}
}

/**
 * Check if a user is visiting for the first time
 */
export function checkFirstVisit() {
	const VISITED_KEY = "downloadFestivalVisited";
	const visited = loadFromStorage(VISITED_KEY) || false;

	if (!visited) {
		saveToStorage(VISITED_KEY, true);
		// Instead of showing modal, set a flag
		state.showFavoritesModalAfterData = true;
	}
}

/**
 * Check for schedule conflicts between favorite artists
 * @returns {Array} Array of conflicts found, empty if none
 */
export function checkForConflicts() {
	if (state.favoriteSets.length < 2) return []; // Need at least 2 favorites to have a conflict

	const conflicts = [];

	// Check Arena conflicts
	Object.keys(state.data.arena).forEach((day) => {
		const stages = Object.keys(state.data.arena[day]);
		const dayConflicts = findConflictsForVenue("arena", day, stages);

		if (dayConflicts.length > 0) {
			conflicts.push(...dayConflicts);
		}
	});

	// Check District X conflicts
	if (state.data.districtX) {
		Object.keys(state.data.districtX).forEach((day) => {
			if (!state.data.districtX[day]) return;

			const stages = Object.keys(state.data.districtX[day]);
			const dayConflicts = findConflictsForVenue(
				"districtX",
				day,
				stages
			);

			if (dayConflicts.length > 0) {
				conflicts.push(...dayConflicts);
			}
		});
	}

	// Check cross-venue conflicts
	const crossVenueConflicts = findCrossVenueConflicts();
	if (crossVenueConflicts.length > 0) {
		conflicts.push(...crossVenueConflicts);
	}

	return conflicts;
}

/**
 * Find conflicts between favorite artists within a venue
 * @param {string} venue - 'arena' or 'districtX'
 * @param {string} day - Day to check
 * @param {Array} stages - Stages to check
 */
function findConflictsForVenue(venue, day, stages) {
	const conflicts = [];

	// Build an array of all favorite performances for this day and venue
	const favoriteSets = [];

	stages.forEach((stage) => {
		if (!Array.isArray(state.data[venue][day][stage])) return;

		state.data[venue][day][stage].forEach((set) => {
			const setKey = getSetKey(set.artist, day, stage, set.start);
			if (
				state.favoriteSets.some((fav) => fav.setKey === setKey) &&
				set.start &&
				set.end
			) {
				favoriteSets.push({
					artist: set.artist,
					stage: stage,
					start: set.start,
					end: set.end,
					startMin: timeToMinutes(set.start),
					endMin: timeToMinutes(set.end),
					venue: venue,
				});
			}
		});
	});

	// Check each set against others for conflicts
	for (let i = 0; i < favoriteSets.length; i++) {
		for (let j = i + 1; j < favoriteSets.length; j++) {
			const set1 = favoriteSets[i];
			const set2 = favoriteSets[j];

			if (set1.startMin < set2.endMin && set1.endMin > set2.startMin) {
				conflicts.push({
					day: day,
					artist1: set1.artist,
					artist2: set2.artist,
					time1: `${set1.start}-${set1.end}`,
					time2: `${set2.start}-${set2.end}`,
					stage1: set1.stage,
					stage2: set2.stage,
				});
			}
		}
	}

	return conflicts;
}

/**
 * Find conflicts between favorite artists in different venues on the same day
 */
function findCrossVenueConflicts() {
	const conflicts = [];
	const commonDays = ["friday", "saturday", "sunday"]; // Days that both venues operate

	commonDays.forEach((day) => {
		// Skip if either venue doesn't have data for this day
		if (!state.data.arena[day] || !state.data.districtX[day]) return;

		// Get all favorite sets from Arena
		const arenaFavorites = [];
		Object.keys(state.data.arena[day]).forEach((stage) => {
			state.data.arena[day][stage].forEach((set) => {
				const setKey = getSetKey(set.artist, day, stage, set.start);
				if (
					state.favoriteSets.some((fav) => fav.setKey === setKey) &&
					set.start &&
					set.end
				) {
					arenaFavorites.push({
						artist: set.artist,
						stage: stage,
						start: set.start,
						end: set.end,
						startMin: timeToMinutes(set.start),
						endMin: timeToMinutes(set.end),
						venue: "Arena",
					});
				}
			});
		});

		// Get all favorite sets from District X
		const districtXFavorites = [];
		Object.keys(state.data.districtX[day]).forEach((stage) => {
			if (!Array.isArray(state.data.districtX[day][stage])) return;

			state.data.districtX[day][stage].forEach((set) => {
				const setKey = getSetKey(set.artist, day, stage, set.start);
				if (
					state.favoriteSets.some((fav) => fav.setKey === setKey) &&
					set.start &&
					set.end
				) {
					districtXFavorites.push({
						artist: set.artist,
						stage: stage,
						start: set.start,
						end: set.end,
						startMin: timeToMinutes(set.start),
						endMin: timeToMinutes(set.end),
						venue: "District X",
					});
				}
			});
		});

		// Check for overlaps between Arena and District X
		arenaFavorites.forEach((arenaSet) => {
			districtXFavorites.forEach((districtSet) => {
				if (
					arenaSet.startMin < districtSet.endMin &&
					arenaSet.endMin > districtSet.startMin
				) {
					conflicts.push({
						day: day,
						artist1: arenaSet.artist,
						artist2: districtSet.artist,
						time1: `${arenaSet.start}-${arenaSet.end}`,
						time2: `${districtSet.start}-${districtSet.end}`,
						stage1: arenaSet.stage,
						stage2: districtSet.stage,
						venue1: "Arena",
						venue2: "District X",
					});
				}
			});
		});
	});

	return conflicts;
}

/**
 * Find conflicts for a specific artist set
 * This is used for event detail tooltips
 */
export function findConflictsForSet(set, stage, day, venue) {
	if (
		!set ||
		!set.start ||
		!set.end ||
		!state.favoriteSets.some(
			(fav) => fav.setKey === getSetKey(set.artist, day, stage, set.start)
		)
	) {
		return [];
	}

	const conflicts = [];
	const startMin = timeToMinutes(set.start);
	const endMin = timeToMinutes(set.end);

	// Check for conflicts in same venue (different stages)
	if (state.data[venue] && state.data[venue][day]) {
		Object.keys(state.data[venue][day]).forEach((otherStage) => {
			if (otherStage === stage) return; // Skip same stage

			if (Array.isArray(state.data[venue][day][otherStage])) {
				state.data[venue][day][otherStage].forEach((otherSet) => {
					if (
						!state.favoriteSets.some(
							(fav) =>
								fav.setKey ===
								getSetKey(
									otherSet.artist,
									day,
									otherStage,
									otherSet.start
								)
						)
					)
						return;
					if (!otherSet.start || !otherSet.end) return;

					const otherStart = timeToMinutes(otherSet.start);
					const otherEnd = timeToMinutes(otherSet.end);

					if (startMin < otherEnd && endMin > otherStart) {
						conflicts.push({
							artist: otherSet.artist,
							stage: otherStage,
							start: otherSet.start,
							end: otherSet.end,
							venue: venue === "arena" ? "Arena" : "District X",
						});
					}
				});
			}
		});
	}

	// Check for conflicts in other venue on same day
	const otherVenue = venue === "arena" ? "districtX" : "arena";

	if (state.data[otherVenue] && state.data[otherVenue][day]) {
		Object.keys(state.data[otherVenue][day]).forEach((otherStage) => {
			if (Array.isArray(state.data[otherVenue][day][otherStage])) {
				state.data[otherVenue][day][otherStage].forEach((otherSet) => {
					if (
						!state.favoriteSets.some(
							(fav) =>
								fav.setKey ===
								getSetKey(
									otherSet.artist,
									day,
									otherStage,
									otherSet.start
								)
						)
					)
						return;
					if (!otherSet.start || !otherSet.end) return;

					const otherStart = timeToMinutes(otherSet.start);
					const otherEnd = timeToMinutes(otherSet.end);

					if (startMin < otherEnd && endMin > otherStart) {
						conflicts.push({
							artist: otherSet.artist,
							stage: otherStage,
							start: otherSet.start,
							end: otherSet.end,
							venue:
								otherVenue === "arena" ? "Arena" : "District X",
						});
					}
				});
			}
		});
	}

	return conflicts;
}
