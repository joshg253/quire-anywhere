import {StorageService} from "./storage.service.js";
import {StorageConstants} from "./storage.constants.js";

// Routes tasks to a project by the site they come from. Rules are [{host, projId}], kept in storage.sync so they follow the user.
export class SiteRulesService {
  static async getRules() {
    const stored = await StorageService.readSync(StorageConstants.SETTINGS.SITE_RULES);
    return stored ? JSON.parse(stored) : [];
  }

  static async saveRules(rules) {
    await StorageService.saveSync(StorageConstants.SETTINGS.SITE_RULES, JSON.stringify(rules));
  }

  // "https://www.Example.com/a" -> "example.com"; null if it isn't a usable host
  static normalizeHost(input) {
    try {
      const text = input.trim();
      return new URL(text.includes("://") ? text : "https://" + text).hostname.replace(/^www\./, "") || null;
    } catch (e) {
      return null;
    }
  }

  // A rule for "bandcamp.com" matches that host and its subdomains; the longest (most specific) matching rule wins.
  static findRule(rules, url) {
    const hostname = SiteRulesService.normalizeHost(url);
    if (!hostname) {
      return null;
    }
    return [...rules]
        .sort((a, b) => b.host.length - a.host.length)
        .find(rule => hostname === rule.host || hostname.endsWith("." + rule.host)) ?? null;
  }

  // The rule's project if one matches and the app can still see it, otherwise the default project.
  static async resolveProjectId(url, defaultProjectId) {
    const rule = SiteRulesService.findRule(await SiteRulesService.getRules(), url);
    if (rule) {
      const allProjects = JSON.parse(await StorageService.readLocal(StorageConstants.QUIRE.ALL_PROJECTS)) ?? {};
      if (allProjects[rule.projId]) {
        return rule.projId;
      }
      console.warn(`Project ${rule.projId} for ${rule.host} is not available, using the default project`);
    }
    return defaultProjectId;
  }
}
