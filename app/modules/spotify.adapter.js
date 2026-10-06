// Spotify adapter: album pages (/album/<id>) in the web player. The page has no usable meta tags, so extract() reads the header text,
// which looks like "Album\n<name>\n<artist>\n<artist>\n•\n2016\n•\n18 songs\n, \n1 hr 36 min".

// Injected into the page with chrome.scripting, so it must stay self-contained (no references outside this function).
function extractSpotifyData() {
  const lines = (document.querySelector("main")?.innerText ?? "").split("\n").map(line => line.trim()).filter(Boolean);
  const dot = lines.indexOf("•");
  if (dot < 2) {
    return null;
  }
  // Before the first dot: type (Album, Single, EP), name, then the artists
  const [, name, ...artists] = lines.slice(0, dot);
  const header = lines.slice(dot, dot + 8).join(" ");
  const hours = header.match(/(\d+) hr/)?.[1];
  const minutes = header.match(/(\d+) min/)?.[1];
  const seconds = header.match(/(\d+) sec/)?.[1];
  return {
    name,
    artist: artists[0] ?? null,
    year: Number(lines[dot + 1]) || null,
    hours: hours ? Number(hours) : 0,
    minutes: minutes ? Number(minutes) : 0,
    seconds: seconds ? Number(seconds) : 0,
  };
}

// The total length the way Spotify shows track times: "1:36" for 1 hr 36 min, "42:10" for 42 min 10 sec
function formatDuration({hours, minutes, seconds}) {
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }
  return minutes > 0 || seconds > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : null;
}

// Nothing to set on the task itself.
function enrichSpotifyData() {
  return {};
}

// Values for the title and custom field templates.
function spotifyValues(data) {
  return {name: data.name, artist: data.artist, year: data.year, duration: formatDuration(data)};
}

export const SpotifyAdapter = {
  id: "spotify",
  name: "Spotify",
  hosts: ["open.spotify.com"],
  matchesPage(url) {
    try {
      return /^\/album\/\w+/.test(new URL(url).pathname);
    } catch (e) {
      return false;
    }
  },
  extract: extractSpotifyData,
  values: spotifyValues,
  variables: ["title", "name", "artist", "year", "duration"],
  defaultTitle: "{duration} {artist} – {name} [{year}]",
  enrich: enrichSpotifyData,
};
