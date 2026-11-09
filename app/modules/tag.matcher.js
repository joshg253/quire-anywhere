// Matches page tags against a project's existing tags. Only library tags are ever applied, always with the project's own spelling.
export class TagMatcher {
  // "Post-Metal", "post metal" and "postmetal" are the same tag; zero-width characters (some page tags carry them) don't count
  static normalize(text) {
    return text.toLowerCase().replace(/[​-‏⁠﻿\s\-_.]+/g, "");
  }

  // An alias for the text (not case sensitive) wins over normalization. Its target is the library tag, or {create: name} when the
  // library has none yet (the user named that tag, so it is created); otherwise the text matches the library by itself.
  // An alias target may name several tags, comma separated ("Indie, rock"), unless the whole target is itself a library tag.
  // -> [tag or {create}] or null
  static resolve(text, index, aliases) {
    const target = (aliases.get(text.trim().toLowerCase()) ?? "").trim();
    const whole = target && TagMatcher.lookup(target, index);
    if (whole) {
      return [whole];
    }
    const names = target.split(",").map(name => name.trim()).filter(Boolean);
    if (names.length > 0) {
      return names.map(name => TagMatcher.lookup(name, index) ?? {create: name});
    }
    const tag = TagMatcher.lookup(text, index);
    return tag ? [tag] : null;
  }

  // Splits an unmatched multi-word tag into known pieces, longest first (backing off when the rest can't be matched), each resolved like
  // a whole tag (so a piece can have its own alias). All or nothing: if any piece is unknown the tag stays unmatched, rather than
  // applying half of it. -> [tag or {create}] or null
  static split(text, index, aliases) {
    const words = text.trim().split(/\s+/);
    const from = start => {
      if (start === words.length) {
        return [];
      }
      for (let end = words.length; end > start; end--) {
        const tags = TagMatcher.resolve(words.slice(start, end).join(" "), index, aliases);
        const rest = tags && from(end);
        if (rest) {
          return [...tags, ...rest];
        }
      }
      return null;
    };
    return from(0);
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
  // the location's tag first (first candidate that exists), then the page tags left to right. Tags are matched whole (or by alias); a
  // multi-word page tag with no match is split into known pieces if every piece resolves, else listed as unmatched.
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
      const tags = TagMatcher.resolve(candidate, index, aliasMap);
      if (tags) {
        tags.forEach(apply);
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
      const tags = TagMatcher.resolve(text, index, aliasMap) ?? TagMatcher.split(text, index, aliasMap);
      if (tags) {
        tags.forEach(apply);
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
