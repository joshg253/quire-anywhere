import {BandcampAdapter} from "./bandcamp.adapter.js";

// Bundled site adapters only (no remote code). Each has: id, matches(url), extract() (runs in the page), enrich(data) -> task fields.
const adapters = [BandcampAdapter];

export class AdapterRegistry {
  static findAdapter(url) {
    return adapters.find(adapter => adapter.matches(url)) ?? null;
  }

  // Task fields for the tab's page, or {} when no adapter applies or anything fails: enriching must never block adding the task.
  // Needs activeTab, which the context menu click grants.
  static async enrichTab(tab) {
    const adapter = AdapterRegistry.findAdapter(tab.url);
    if (!adapter) {
      return {};
    }
    try {
      const [injection] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: adapter.extract});
      return injection?.result ? adapter.enrich(injection.result) : {};
    } catch (e) {
      console.warn(`${adapter.id} enrichment failed, adding the plain task`, e);
      return {};
    }
  }
}
