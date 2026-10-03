// HowLongToBeat adapter: game pages (/game/<id>) embed the game's data as Next.js JSON, with completion times in seconds.

// Injected into the page with chrome.scripting, so it must stay self-contained (no references outside this function).
function extractHltbData() {
  const element = document.getElementById("__NEXT_DATA__");
  const urlId = location.pathname.match(/^\/game\/(\d+)/)?.[1];
  if (!element || !urlId) {
    return null;
  }
  const game = JSON.parse(element.textContent).props?.pageProps?.game?.data?.game?.[0];
  // The embedded data goes stale after in-site navigation, so only trust it when it matches the URL
  if (!game || String(game.game_id) !== urlId) {
    return null;
  }
  return {
    name: game.game_name,
    releaseDate: game.release_world,
    times: {main: game.comp_main, plus: game.comp_plus, completionist: game.comp_100, all: game.comp_all},
  };
}

// Estimate (`etc`, seconds) = the time flavor chosen in Settings; no estimate when HowLongToBeat has none for it.
function enrichHltbData(data, options) {
  const seconds = data.times[options.estimate];
  return seconds > 0 ? {etc: Math.round(seconds)} : {};
}

// "Game Title [year]"; release dates HowLongToBeat doesn't know are "0000-00-00".
function hltbTitle(data) {
  const year = Number(data.releaseDate?.slice(0, 4));
  return year > 0 ? `${data.name} [${year}]` : data.name;
}

export const HltbAdapter = {
  id: "hltb",
  name: "HowLongToBeat",
  matches(url) {
    try {
      const {hostname, pathname} = new URL(url);
      return (hostname === "howlongtobeat.com" || hostname.endsWith(".howlongtobeat.com")) && /^\/game\/\d+/.test(pathname);
    } catch (e) {
      return false;
    }
  },
  options: [{
    key: "estimate",
    label: "Estimate from",
    default: "completionist",
    choices: [
      {value: "main", label: "Main Story"},
      {value: "plus", label: "Main + Extras"},
      {value: "completionist", label: "Completionist"},
      {value: "all", label: "All Styles"},
    ],
  }],
  extract: extractHltbData,
  title: hltbTitle,
  enrich: enrichHltbData,
};
