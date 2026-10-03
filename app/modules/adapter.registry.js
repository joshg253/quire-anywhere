import {BandcampAdapter} from "./bandcamp.adapter.js";
import {HltbAdapter} from "./hltb.adapter.js";
import {AdapterSettingsService} from "./adapter.settings.service.js";

// Bundled site adapters only (no remote code). Each has: id, name, matches(url), extract() (runs in the page), enrich(data, options) ->
// task fields. Optional: options (settings schema: [{key, label, default, choices: [{value, label}]}]), title(data), customFields(data)
// and tagCandidates(data) -> {location, tags}; tagCandidates also turns on tag aliases for the adapter in Settings.
const adapters = [BandcampAdapter, HltbAdapter];

const EMPTY = () => ({fields: {}, customFields: {}, tagCandidates: null, title: null, aliases: []});

export class AdapterRegistry {
  static get adapters() {
    return adapters;
  }

  static findAdapter(url) {
    return adapters.find(adapter => adapter.matches(url)) ?? null;
  }

  // {fields, customFields, tagCandidates, title, aliases} for the tab's page; empty when no enabled adapter applies or anything fails:
  // enriching must never block adding the task. Needs activeTab, which the context menu click grants.
  static async enrichTab(tab) {
    const adapter = AdapterRegistry.findAdapter(tab.url);
    if (!adapter) {
      return EMPTY();
    }
    try {
      const settings = await AdapterSettingsService.get(adapter);
      if (!settings.enabled) {
        return EMPTY();
      }
      const [injection] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: adapter.extract});
      const data = injection?.result;
      if (!data) {
        return EMPTY();
      }
      return {
        fields: adapter.enrich(data, settings.options),
        customFields: adapter.customFields?.(data) ?? {},
        tagCandidates: adapter.tagCandidates?.(data) ?? null,
        title: adapter.title?.(data) ?? null,
        aliases: settings.aliases,
      };
    } catch (e) {
      console.warn(`${adapter.id} enrichment failed, adding the plain task`, e);
      return EMPTY();
    }
  }
}
