// Runs inside the page (injected with chrome.scripting.executeScript), so it must stay self-contained.
// -> [{url, text}] for the page's http(s) links (only those touching the selection when selectionOnly), deduped by URL, without links back
// to the page itself.
export function collectLinks(selectionOnly) {
  const selection = window.getSelection();
  const here = location.href.split("#")[0];
  const found = new Map();
  for (const a of document.querySelectorAll("a[href]")) {
    if (selectionOnly && !(selection && selection.rangeCount > 0 && selection.containsNode(a, true))) {
      continue;
    }
    if (!/^https?:$/.test(a.protocol) || a.href.split("#")[0] === here) {
      continue;
    }
    const text = (a.innerText || a.textContent || a.querySelector("img[alt]")?.alt || a.title || "").replace(/\s+/g, " ").trim();
    if (!found.has(a.href) || (!found.get(a.href) && text)) {
      found.set(a.href, text);
    }
  }
  return [...found].map(([url, text]) => ({url, text}));
}
