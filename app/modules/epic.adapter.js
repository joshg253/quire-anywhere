// Epic Games adapter: store product pages (/p/<slug>) get their name and release date from Epic's public content API.

// Injected into the page with chrome.scripting, so it must stay self-contained (no references outside this function).
async function extractEpicData() {
  const slug = location.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Za-z0-9]{2,4})?\/)?p\/([^/?#]+)/)?.[1];
  if (!slug) {
    return null;
  }
  // The API allows CORS from store.epicgames.com, so the page can call it without a host permission. The signal also covers reading the
  // body, so a stalled API can't hold up adding the task.
  const response = await fetch(`https://store-content-ipv4.ak.epicgames.com/api/en-US/content/products/${encodeURIComponent(slug)}`,
      {signal: AbortSignal.timeout(5000)});
  const product = await response.json();
  const name = (product.productName ?? "").replace(/[™®©℠]/g, "").replace(/\s+/g, " ").trim();
  // Every page of the product (home, editions) carries the date; take the first one that has it
  const released = product.pages?.map(p => p.data?.meta?.releaseDate).find(Boolean) ?? null;
  return name ? {name, released} : null;
}

// There's no usable HowLongToBeat lookup by name (its search API needs a rotating token), so link its search page instead.
function enrichEpicData(data) {
  return {links: [`https://howlongtobeat.com/?q=${encodeURIComponent(data.name)}`]};
}

// Values for the title and custom field templates; the release date is ISO ("2020-12-10T00:00:00.000Z").
function epicValues(data) {
  const year = Number(data.released?.slice(0, 4));
  return {name: data.name, year: year > 0 ? year : null};
}

export const EpicAdapter = {
  id: "epic",
  category: "Games",
  name: "Epic Games",
  hosts: ["store.epicgames.com"],
  matchesPage(url) {
    try {
      return /^\/(?:[a-z]{2}(?:-[A-Za-z0-9]{2,4})?\/)?p\//.test(new URL(url).pathname);
    } catch (e) {
      return false;
    }
  },
  extract: extractEpicData,
  values: epicValues,
  variables: ["title", "name", "year"],
  defaultTitle: "{name} [{year}]",
  tags: ["Epic"],
  enrich: enrichEpicData,
};
