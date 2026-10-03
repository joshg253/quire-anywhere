import {StorageService} from "./storage.service.js";
import {StorageConstants} from "./storage.constants.js";

// Page text -> project tag name, e.g. {text: "psychedelic", tag: "psych"}. Kept in storage.sync so it follows the user.
export class TagAliasService {
  static async getAliases() {
    const stored = await StorageService.readSync(StorageConstants.SETTINGS.TAG_ALIASES);
    return stored ? JSON.parse(stored) : [];
  }

  static async saveAliases(aliases) {
    await StorageService.saveSync(StorageConstants.SETTINGS.TAG_ALIASES, JSON.stringify(aliases));
  }
}
