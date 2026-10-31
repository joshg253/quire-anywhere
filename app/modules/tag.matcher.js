// Matches page tags against a project's existing tags. Only library tags are ever applied, always with the project's own spelling.
export class TagMatcher {
  // "Post-Metal", "post metal" and "postmetal" are the same tag; zero-width characters (some page tags carry them) don't count
  static normalize(text) {
    return text.toLowerCase().replace(/[​-‏⁠﻿\s\-_.]+/g, "");
  }

  // An alias for the text (not case sensitive) wins over normalization. Its target is the library tag, or {create: name} when the
  // library has none yet (the user named that tag, so it is created); otherwise the text matches the library by itself.
  static resolve(text, index, aliases) {
    const target = aliases.get(text.trim().toLowerCase())?.trim();
    if (target) {
      return TagMatcher.lookup(target, index) ?? {create: target};
    }
    return TagMatcher.lookup(text, index);
  }

  // Two library tags that normalize alike: an exact (case-insensitive) match to the text wins, otherwise none (ambiguous).
  static lookup(text, index) {
    const matches = index.get(TagMatcher.normalize(text));
    if (!matches) {
      return null;
    }
    if (matches.length === 1) {
      return matches[0];
    }
    return matches.find(tag => tag.name.toLowerCase() === text.trim().toLowerCase()) ?? null;
  }

  // "post rock" -> "post-rock", for tags we show but don't apply
  static formatUnmatched(text) {
    return text.trim().replace(/^post\s+(\S+)$/i, "post-$1");
  }

  // candidates: {location: [strings, best first], tags: [strings in page order]}; libraryTags: [{oid, name}];
  // aliases: [{text, tag}]; ignored: [text] to skip, as whole tags or as words of a longer tag.
  // Returns {oids, unmatched, create}: create lists alias target names the library lacks (deduped, to be created by the caller);
  // the location's tag first (first candidate that exists), then the page tags left to right. Tags are matched whole (or by alias),
  // never split into words: one with no match is listed as unmatched.
  static match(candidates, libraryTags, aliases = [], ignored = []) {
    const ignoredKeys = new Set(ignored.map(TagMatcher.normalize));
    const isIgnored = text => ignoredKeys.has(TagMatcher.normalize(text));
    const aliasMap = new Map(aliases.map(alias => [alias.text.trim().toLowerCase(), alias.tag]));
    const index = new Map();
    for (const tag of libraryTags) {
      const key = TagMatcher.normalize(tag.name);
      index.set(key, [...(index.get(key) ?? []), tag]);
    }

    const oids = [];
    const unmatched = [];
    const create = [];
    const apply = tag => {
      if (tag.create) {
        if (!create.some(name => TagMatcher.normalize(name) === TagMatcher.normalize(tag.create))) {
          create.push(tag.create);
        }
      } else if (!oids.includes(tag.oid)) {
        oids.push(tag.oid);
      }
    };

    for (const [i, candidate] of candidates.location.entries()) {
      const tag = TagMatcher.resolve(candidate, index, aliasMap);
      if (tag) {
        apply(tag);
        break;
      }
      // An alias for the whole location line means the user chose its tag: don't fall back to its parts (e.g. "California" -> CA) if
      // it's missing
      if (i === 0 && aliasMap.has(candidate.trim().toLowerCase())) {
        break;
      }
    }

    for (const candidate of candidates.tags.filter(tag => !isIgnored(tag))) {
      // "experimental music" with "music" ignored is just "experimental"
      const words = candidate.trim().split(/\s+/).filter(word => !isIgnored(word));
      if (words.length === 0) {
        continue;
      }
      const text = words.join(" ");
      const whole = TagMatcher.resolve(text, index, aliasMap);
      if (whole) {
        apply(whole);
        continue;
      }
      unmatched.push(TagMatcher.formatUnmatched(text));
    }

    const seen = new Set();
    return {
      oids,
      create,
      unmatched: unmatched.filter(text => !seen.has(text.toLowerCase()) && seen.add(text.toLowerCase())),
    };
  }
}
