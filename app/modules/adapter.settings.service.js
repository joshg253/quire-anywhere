import {StorageService} from "./storage.service.js";
import {StorageConstants} from "./storage.constants.js";

// Per-adapter settings in storage.sync: {<adapterId>: {enabled, aliases: [{text, tag}], options: {<key>: value}}}. Adapters are off until
// enabled; aliases map page text -> project tag name, e.g. {text: "psychedelic", tag: "psych"}.
export class AdapterSettingsService {
  static async getAll() {
    const stored = await StorageService.readSync(StorageConstants.SETTINGS.ADAPTERS);
    if (stored) {
      return JSON.parse(stored);
    }
    // Aliases used to be one global list, and only Bandcamp used them
    const legacy = await StorageService.readSync(StorageConstants.SETTINGS.TAG_ALIASES);
    const all = legacy ? {bandcamp: {aliases: JSON.parse(legacy)}} : {};
    if (legacy) {
      await AdapterSettingsService.saveAll(all);
      await StorageService.removeSync(StorageConstants.SETTINGS.TAG_ALIASES);
    }
    return all;
  }

  static async saveAll(all) {
    await StorageService.saveSync(StorageConstants.SETTINGS.ADAPTERS, JSON.stringify(all));
  }

  // The adapter's settings with defaults filled in, so callers never see missing keys.
  static async get(adapter) {
    const saved = (await AdapterSettingsService.getAll())[adapter.id] ?? {};
    const options = Object.fromEntries((adapter.options ?? []).map(option => [option.key, option.default]));
    return {enabled: saved.enabled === true, aliases: saved.aliases ?? [], options: {...options, ...saved.options}};
  }

  static async save(adapter, settings) {
    const all = await AdapterSettingsService.getAll();
    all[adapter.id] = settings;
    await AdapterSettingsService.saveAll(all);
  }
}
