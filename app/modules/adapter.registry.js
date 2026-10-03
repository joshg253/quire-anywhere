import {BandcampAdapter} from "./bandcamp.adapter.js";

// Bundled site adapters only (no remote code). Each has: id, matches(url), extract() (runs in the page), enrich(data) -> task fields,
// optional tagCandidates(data) -> {location, tags}.
const adapters = [BandcampAdapter];

export class AdapterRegistry {
  static findAdapter(url) {
    return adapters.find(adapter => adapter.matches(url)) ?? null;
  }

  // {fields, tagCandidates} for the tab's page; empty when no adapter applies or anything fails: enriching must never block adding the
  // task. Needs activeTab, which the context menu click grants.
  static async enrichTab(tab) {
    const adapter = AdapterRegistry.findAdapter(tab.url);
    if (!adapter) {
      return {fields: {}, tagCandidates: null};
    }
    try {
      const [injection] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: adapter.extract});
      const data = injection?.result;
      if (!data) {
        return {fields: {}, tagCandidates: null};
      }
      return {fields: adapter.enrich(data), tagCandidates: adapter.tagCandidates?.(data) ?? null};
    } catch (e) {
      console.warn(`${adapter.id} enrichment failed, adding the plain task`, e);
      return {fields: {}, tagCandidates: null};
    }
  }
}
