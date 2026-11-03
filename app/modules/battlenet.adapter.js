// Battle.net adapter: shop product and family pages (/<locale>/product/<slug>, /<locale>/family/<slug>). The shop needs a login, so the
// name comes from the page itself (og:title, h1, title), falling back to the URL slug. The release year is a best-effort scan of the page source and text.

// Injected into the page with chrome.scripting, so it must stay self-contained (no references outside this function).
function extractBattleNetData() {
  const slug = location.pathname.match(/\/(?:product|family)\/([^/?#]+)/)?.[1];
  if (!slug) {
    return null;
  }
  const clean = (text) => (text ?? "").replace(/[™®©℠]/g, "").replace(/\s+/g, " ").replace(/\s*[|–—-]\s*(?:Battle\.net|Blizzard).*$/i, "").trim();
  const name = clean(document.querySelector('meta[property="og:title"]')?.content)
      || clean(document.querySelector("h1")?.textContent)
      || clean(document.title)
      || decodeURIComponent(slug).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  // Best-effort release year: structured data in the page source (JSON-LD, embedded state), else "Release Date" text
  const html = document.documentElement.innerHTML;
  const year = Number(html.match(/"(?:releaseDate|release_date|datePublished|dateReleased)"\s*:\s*"(\d{4})/i)?.[1]
      ?? document.body.innerText.match(/release\s*date\W{0,5}(?:[A-Za-z]+\.?\s+\d{1,2},\s+|\d{1,2}\/\d{1,2}\/)?((?:19|20)\d\d)/i)?.[1]);
  return name ? {name, year: year > 0 ? year : null} : null;
}

// There's no usable HowLongToBeat lookup by name (its search API needs a rotating token), so link its search page instead.
function enrichBattleNetData(data) {
  return {links: [`https://howlongtobeat.com/?q=${encodeURIComponent(data.name)}`]};
}

function battleNetValues(data) {
  return {name: data.name, year: data.year};
}

// A product URL carries the family page it came from in returnFamilyUrl, and the family page lists every edition, so prefer it. Otherwise
// just drop the query (p, pfm, ... are tracking and navigation state).
function cleanBattleNetUrl(url) {
  try {
    const parsed = new URL(url);
    const family = parsed.searchParams.get("returnFamilyUrl");
    if (family) {
      const target = new URL(family, parsed.origin);
      if (target.hostname === parsed.hostname) {
        target.search = "";
        target.hash = "";
        return target.href;
      }
    }
    parsed.search = "";
    return parsed.href;
  } catch (e) {
    return url;
  }
}

export const BattleNetAdapter = {
  id: "battlenet",
  category: "Games",
  name: "Battle.net",
  hosts: ["shop.battle.net"],
  cleanUrl: cleanBattleNetUrl,
  matchesPage(url) {
    try {
      return /\/(?:product|family)\//.test(new URL(url).pathname);
    } catch (e) {
      return false;
    }
  },
  extract: extractBattleNetData,
  values: battleNetValues,
  variables: ["title", "name", "year"],
  defaultTitle: "{name} [{year}]",
  keepEmptyBrackets: true,
  tags: ["Battle.net"],
  enrich: enrichBattleNetData,
};
