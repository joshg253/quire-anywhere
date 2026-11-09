import {ApiDataService} from "../../modules/api.data.service.js";
import {StorageService} from "../../modules/storage.service.js";
import {StorageConstants} from "../../modules/storage.constants.js";
import {SiteRulesService} from "../../modules/site.rules.service.js";
import {AdapterRegistry} from "../../modules/adapter.registry.js";
import {LinksIgnoreService} from "../../modules/links.ignore.service.js";

const MANY_LINKS = 50;  // the selected count turns red above this
const IGNORED_PREFIX = "ignored: ";  // group key prefix, so an ignored set never merges with the same host's kept links

const pendingKey = StorageConstants.SESSION.PENDING_LINKS + new URLSearchParams(location.search).get("id");
const pending = (await chrome.storage.session.get(pendingKey))[pendingKey];
const links = pending?.links ?? [];
const sourceHost = SiteRulesService.normalizeHost(pending?.pageUrl ?? "");
const linkBoxes = new Map();  // link -> checkbox
const nodes = [];  // {box, leaves: [link checkboxes]} for every group and subdomain checkbox
const enrichBoxes = new Map();  // group key -> its Enrich checkbox
const info = new Map();  // link -> {group, host, adapterName, origin}; adapterName/origin only if an enabled adapter would enrich it

$("#source").text(pending?.pageTitle ?? "");
$("#title-" + ((await StorageService.readSync(StorageConstants.SETTINGS.LINKS_TITLE_SOURCE)) === "url" ? "url" : "text")).prop("checked", true);
$("input[name=title-source]").on("change", () => StorageService.saveSync(StorageConstants.SETTINGS.LINKS_TITLE_SOURCE, titleSource()));
const titleSource = () => $("input[name=title-source]:checked").val();

const pathOf = url => { try { return new URL(url).pathname; } catch { return ""; } };

// Groups are an adapter site's host (all of its subdomains together) or the link's own host; -> [[group, [links]]], biggest first
// Links the ignore settings set aside get their own groups (keyed with IGNORED_PREFIX), listed after the rest.
async function buildGroups() {
  const groups = new Map();
  const ignoreSettings = await LinksIgnoreService.get();
  // On an adapter site's page (an artist's page on bandcamp.com, or their own domain added to the adapter) the page's own links are its
  // items, so only its parents are "same site"
  const sourceSite = await AdapterRegistry.findSite(pending?.pageUrl ?? "");
  const keepOwnHost = !!sourceSite;
  for (const link of links) {
    const host = SiteRulesService.normalizeHost(link.url) ?? "(unknown)";
    const found = await AdapterRegistry.findSite(link.url);
    const enrich = found && await AdapterRegistry.enrichingAdapter(link.url);
    // An adapter that names its item pages (Bandcamp albums and tracks) has the site's other links set aside
    const notItem = found?.adapter.itemPath && !found.adapter.itemPath.test(pathOf(link.url));
    const ignoredReason = LinksIgnoreService.reason(ignoreSettings, host, sourceHost, keepOwnHost)
        ?? (notItem ? `not a ${found.adapter.name} item page` : null);
    const group = (ignoredReason ? `${IGNORED_PREFIX}${ignoredReason}|` : "") + (found?.site.host ?? host);
    info.set(link, {group, host, ignoredReason, adapterName: enrich ? found.adapter.name : null,
      origin: enrich ? `*://*.${found.site.host}/*` : null});
    groups.set(group, [...(groups.get(group) ?? []), link]);
  }
  const ignored = group => group.startsWith(IGNORED_PREFIX);
  return [...groups].sort((a, b) => ignored(a[0]) - ignored(b[0]) || b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function updateStatus() {
  const n = [...linkBoxes.values()].filter(box => box.checked).length;
  $("#status").text(`${n} of ${links.length} selected`).toggleClass("text-danger font-weight-bold", n > MANY_LINKS);
  $("#add").prop("disabled", n === 0).text(n ? `Add ${n} task${n === 1 ? "" : "s"}` : "Add");
}

// Group and subdomain boxes mirror the link boxes under them: checked when all are, indeterminate when some are
function syncNodes() {
  for (const {box, leaves} of nodes) {
    const on = leaves.filter(leaf => leaf.checked).length;
    box.checked = leaves.length > 0 && on === leaves.length;
    box.indeterminate = on > 0 && on < leaves.length;
  }
}

function refresh() {
  syncNodes();
  updateStatus();
}

// A header row (checkbox, name, count) plus a collapsible body; checking the box checks every link inside
function makeNode(name, nodeLinks, extra) {
  const box = $('<input type="checkbox" class="mr-2">')[0];
  const body = $('<div class="link-list d-none"></div>');
  const header = $('<div class="host-row"></div>').append(box, $('<span class="host-name"></span>').text(name),
      $('<span class="badge badge-secondary"></span>').text(nodeLinks.length));
  if (extra) {
    header.append(extra);
  }
  header.on("click", e => {
    if (e.target === header[0] || $(e.target).hasClass("host-name") || $(e.target).hasClass("badge")) {
      body.toggleClass("d-none");
    }
  });
  const node = {box, leaves: []};
  nodes.push(node);
  $(box).on("change", () => {
    node.leaves.forEach(leaf => leaf.checked = box.checked);
    refresh();
  });
  return {node, element: $("<div></div>").append(header, body), body};
}

function renderLink(link, body, nodesToJoin) {
  const box = $('<input type="checkbox" class="mr-2">')[0];
  box.checked = pending.selectedByDefault && !info.get(link).ignoredReason;
  linkBoxes.set(link, box);
  nodesToJoin.forEach(node => node.leaves.push(box));
  $(box).on("change", refresh);
  body.append($('<div class="link-row"></div>').append(box, $("<label></label>").text(link.text || link.url).attr("title", link.url),
      $("<span class='url text-truncate'></span>").text(link.text ? link.url : "")));
}

// "Ignore here" / "Ignore everywhere" add the group's host to the ignore settings, for the next time the dialog opens.
function ignoreButtons(host) {
  const button = (label, title, change) => $('<button type="button" class="btn btn-sm btn-link py-0"></button>').text(label).attr("title", title)
      .on("click", async function () {
        const buttons = $(this).parent().find("button");
        try {
          await LinksIgnoreService.update(change);
          buttons.prop("disabled", true);
          $(this).text("Saved");
        } catch (e) {
          $(this).text("Not saved").attr("title", e.message);
        }
      });
  return $('<span class="ml-3 small"></span>').append(
      sourceHost ? button("Ignore here", `Set ${host} aside whenever you add links from ${sourceHost}`,
          s => s.bySource[sourceHost] = [...(s.bySource[sourceHost] ?? []), host]) : "",
      button("Ignore everywhere", `Set ${host} aside on every page`, s => s.global.push(host)));
}

function renderGroup(key, groupLinks) {
  const group = key.startsWith(IGNORED_PREFIX) ? key.slice(key.indexOf("|") + 1) : key;  // ignored keys are "ignored: <reason>|<host>"
  const ignoredReason = info.get(groupLinks[0]).ignoredReason;
  const adapterName = info.get(groupLinks.find(link => info.get(link).adapterName) ?? groupLinks[0]).adapterName;
  let extra = ignoredReason ? $('<span class="ml-3 small text-muted"></span>').text(ignoredReason)
      : (group === "(unknown)" ? "" : ignoreButtons(group));
  if (adapterName) {
    const enrichBox = $('<input type="checkbox" class="mr-1" checked>')[0];
    enrichBoxes.set(key, enrichBox);
    extra = $('<span></span>').append(extra, $('<label class="mb-0 ml-3 small" title="Open each link in a background tab and add it like a page, with the adapter title, tags and fields"></label>')
        .append(enrichBox, `Enrich (${adapterName})`));
  }
  const top = makeNode(ignoredReason ? `${group} (ignored)` : group, groupLinks, extra);
  const hosts = new Map();
  groupLinks.forEach(link => hosts.set(info.get(link).host, [...(hosts.get(info.get(link).host) ?? []), link]));
  if (hosts.size === 1) {
    groupLinks.forEach(link => renderLink(link, top.body, [top.node]));
  } else {
    for (const [host, hostLinks] of [...hosts].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      const sub = makeNode(host, hostLinks);
      hostLinks.forEach(link => renderLink(link, sub.body, [top.node, sub.node]));
      top.body.append(sub.element);
    }
  }
  $("#groups").append($('<div class="mb-2"></div>').append(top.element));
}

function setAll(checked) {
  linkBoxes.forEach(box => box.checked = checked);
  refresh();
}

if (links.length === 0) {
  $("#empty").removeClass("d-none");
  $("#controls").addClass("d-none");
} else {
  for (const [group, groupLinks] of await buildGroups()) {
    renderGroup(group, groupLinks);
  }
  refresh();
}

$("#select-all").on("click", () => setAll(true));
$("#select-none").on("click", () => setAll(false));
$("#close").on("click", () => window.close());

$("#add").on("click", async () => {
  const chosen = links.filter(link => linkBoxes.get(link).checked);
  const enrichGroups = new Set([...enrichBoxes].filter(([, box]) => box.checked).map(([group]) => group));
  const enrichable = chosen.filter(link => info.get(link).origin && enrichGroups.has(info.get(link).group));
  // Must be the first await so the click still counts as the user gesture the permission prompt needs
  const origins = [...new Set(enrichable.map(link => info.get(link).origin))];
  const granted = origins.length === 0 || await chrome.permissions.request({origins}).catch(() => false);
  enrichable.forEach(link => link.enrich = granted);
  $("#add, #select-all, #select-none, #close, input").prop("disabled", true);
  const {added, failed, aborted} = await ApiDataService.addLinkTasks(
      chosen,
      {pageTitle: pending.pageTitle, pageUrl: pending.pageUrl, titleSource: titleSource()},
      (done, total, failures) => $("#status").text(`Adding ${done} of ${total}` + (failures ? ` (${failures} failed)` : "") + "…"));
  $("#close").prop("disabled", false);
  $("#status").text(`Added ${added} of ${chosen.length}` + (failed ? `, ${failed} failed` : "")
      + (granted ? "" : ". Permission for enrichment was denied, so those were added as plain links")
      + (aborted ? ". Stopped after repeated failures (rate limit or expired login?); the rest were not tried" : "") + ".");
});
