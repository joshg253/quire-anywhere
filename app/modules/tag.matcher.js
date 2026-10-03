// Matches page tags against a project's existing tags. Only library tags are ever applied, always with the project's own spelling.
export class TagMatcher {
  // "Post-Metal", "post metal" and "postmetal" are the same tag
  static normalize(text) {
    return text.toLowerCase().replace(/[\s\-_.]+/g, "");
  }

  // An alias for the text (not case sensitive) wins over normalization, but only if its target tag exists in the library.
  static resolve(text, index, aliases) {
    const target = aliases.get(text.trim().toLowerCase());
    return (target && TagMatcher.lookup(target, index)) || TagMatcher.lookup(text, index);
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
  // aliases: [{text, tag}].
  // Returns {oids, unmatched}: the location's tag first (first candidate that exists), then the page tags left to right. A tag with no
  // whole match is split into words and each word that matches a library tag is applied; the rest are listed as unmatched.
  static match(candidates, libraryTags, aliases = []) {
    const aliasMap = new Map(aliases.map(alias => [alias.text.trim().toLowerCase(), alias.tag]));
    const index = new Map();
    for (const tag of libraryTags) {
      const key = TagMatcher.normalize(tag.name);
      index.set(key, [...(index.get(key) ?? []), tag]);
    }

    const oids = [];
    const unmatched = [];
    const apply = tag => {
      if (!oids.includes(tag.oid)) {
        oids.push(tag.oid);
      }
    };

    for (const candidate of candidates.location) {
      const tag = TagMatcher.resolve(candidate, index, aliasMap);
      if (tag) {
        apply(tag);
        break;
      }
    }

    for (const text of candidates.tags) {
      const whole = TagMatcher.resolve(text, index, aliasMap);
      if (whole) {
        apply(whole);
        continue;
      }
      const words = text.trim().split(/\s+/);
      const wordTags = words.map(word => TagMatcher.resolve(word, index, aliasMap));
      if (words.length === 1 || wordTags.every(tag => !tag)) {
        unmatched.push(TagMatcher.formatUnmatched(text));
        continue;
      }
      words.forEach((word, i) => wordTags[i] ? apply(wordTags[i]) : unmatched.push(word));
    }

    const seen = new Set();
    return {
      oids,
      unmatched: unmatched.filter(text => !seen.has(text.toLowerCase()) && seen.add(text.toLowerCase())),
    };
  }
}
