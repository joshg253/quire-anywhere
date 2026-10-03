// Bandcamp adapter: extract() runs in the page and returns plain data; enrich() turns it into Quire task fields in the background.

const URGENT_PRIORITY = 2;
const URGENT_UNDER_SECONDS = 10 * 60;

// Injected into the page with chrome.scripting, so it must stay self-contained (no references outside this function).
function extractBandcampData() {
  const element = document.querySelector("[data-tralbum]");
  if (!element) {
    return null;
  }
  const tralbum = JSON.parse(element.getAttribute("data-tralbum"));
  return {
    itemType: tralbum.item_type,
    releaseDate: tralbum.current?.release_date ?? tralbum.album_release_date ?? null,
    durations: (tralbum.trackinfo ?? []).map(track => track.duration),
  };
}

// Due = release date. Once released, Estimate (`etc`, seconds) = total length and Urgent if under 10 minutes. A future release date
// gets the due date only: pre-orders can list durations that aren't real. Missing or zero durations skip the estimate rather than
// use a partial sum.
function enrichBandcampData(data, now = new Date()) {
  const fields = {};
  const release = data.releaseDate ? new Date(data.releaseDate) : null;
  if (release && !isNaN(release)) {
    fields.due = release.toISOString().slice(0, 10);
    if (release > now) {
      return fields;
    }
  }
  if (data.durations.length > 0 && data.durations.every(duration => duration > 0)) {
    fields.etc = Math.round(data.durations.reduce((total, duration) => total + duration, 0));
    if (fields.etc < URGENT_UNDER_SECONDS) {
      fields.priority = URGENT_PRIORITY;
    }
  }
  return fields;
}

export const BandcampAdapter = {
  id: "bandcamp",
  matches(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname === "bandcamp.com" || hostname.endsWith(".bandcamp.com");
    } catch (e) {
      return false;
    }
  },
  extract: extractBandcampData,
  enrich: enrichBandcampData,
};
