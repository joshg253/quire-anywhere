import {StorageService} from "./storage.service.js";
import {StorageConstants} from "./storage.constants.js";
import {SiteRulesService} from "./site.rules.service.js";

// Which links the Add Links dialog sets aside (listed at the bottom, unchecked). Stored in storage.sync as
// {sameSite: bool, global: [host], bySource: {sourceHost: [host]}}. A host matches itself and its subdomains. `sameSite` (on by default)
// ignores links to the page's own host, its parent domains and its subdomains, but not sibling subdomains (a.x.com -> b.x.com is kept).
export class LinksIgnoreService {
  static async get() {
    const stored = await StorageService.readSync(StorageConstants.SETTINGS.LINKS_IGNORE);
    const saved = stored ? JSON.parse(stored) : {};
    return {sameSite: saved.sameSite !== false, global: saved.global ?? [], bySource: saved.bySource ?? {}};
  }

  static async save(settings) {
    await StorageService.saveSync(StorageConstants.SETTINGS.LINKS_IGNORE, JSON.stringify(settings));
  }

  // Read-modify-write: `change` edits the settings, then hosts are normalized, deduped and sorted.
  // Calls on this page run one at a time, so two quick edits can't read the same snapshot and drop one another.
  static queue = Promise.resolve();

  static update(change) {
    const run = async () => {
      const settings = await LinksIgnoreService.get();
      change(settings);
      settings.global = LinksIgnoreService.cleanHosts(settings.global);
      for (const source of Object.keys(settings.bySource)) {
        const hosts = LinksIgnoreService.cleanHosts(settings.bySource[source]);
        hosts.length ? settings.bySource[source] = hosts : delete settings.bySource[source];
      }
      await LinksIgnoreService.save(settings);
    };
    const result = LinksIgnoreService.queue.then(run);
    LinksIgnoreService.queue = result.catch(() => {});
    return result;
  }

  static cleanHosts(hosts) {
    const clean = hosts.map(SiteRulesService.normalizeHost).filter(Boolean);
    return [...new Set(clean)].sort();
  }

  // Why the link is set aside: "same site", "ignored everywhere", "ignored from <source>", or null to keep it.
  // `keepOwnHost`: the page is itself a site's content (a Bandcamp artist page), so links into its own host and subdomains are the point,
  // not navigation; its parent domains are still set aside.
  static reason(settings, linkHost, sourceHost, keepOwnHost = false) {
    const matches = (host, rule) => SiteRulesService.hostMatches(host, rule);
    if (!linkHost) {
      return null;
    }
    const own = sourceHost && matches(linkHost, sourceHost);
    const parent = sourceHost && linkHost !== sourceHost && matches(sourceHost, linkHost);
    if (settings.sameSite && (parent || (own && !keepOwnHost))) {
      return "same site";
    }
    if (settings.global.some(rule => matches(linkHost, rule))) {
      return "ignored everywhere";
    }
    if (!sourceHost) {
      return null;
    }
    for (const [source, hosts] of Object.entries(settings.bySource)) {
      if (matches(sourceHost, source) && hosts.some(rule => matches(linkHost, rule))) {
        return `ignored from ${source}`;
      }
    }
    return null;
  }
}
