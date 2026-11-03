// Fills {name} placeholders from values. A placeholder without a value is dropped along with the brackets or parentheses around it
// ("Game [{year}]" -> "Game"), unless keepEmptyBrackets is set ("Game []", for filling in by hand). The result is trimmed.
export function renderTemplate(template, values, keepEmptyBrackets = false) {
  const filled = key => values[key] == null ? "" : String(values[key]);
  const text = keepEmptyBrackets ? template
      : template.replace(/\s*[\[(]\s*\{(\w+)\}\s*[\])]/g, (match, key) => filled(key) ? match.replace(`{${key}}`, filled(key)) : "");
  return text.replace(/\{(\w+)\}/g, (match, key) => filled(key)).trim();
}
