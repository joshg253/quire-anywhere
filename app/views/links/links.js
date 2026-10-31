import {ApiDataService} from "../../modules/api.data.service.js";
import {StorageService} from "../../modules/storage.service.js";
import {StorageConstants} from "../../modules/storage.constants.js";
import {SiteRulesService} from "../../modules/site.rules.service.js";
import {AdapterRegistry} from "../../modules/adapter.registry.js";

const pending = (await chrome.storage.session.get(StorageConstants.SESSION.PENDING_LINKS))[StorageConstants.SESSION.PENDING_LINKS];
const links = pending?.links ?? [];
const linkBoxes = new Map();  // link -> checkbox
const nodes = [];  // {box, leaves: [link checkboxes]} for every group and subdomain checkbox
const enrichBoxes = new Map();  // group key -> its Enrich checkbox
const info = new Map();  // link -> {group, host, adapterName, origin}; adapterName/origin only if an enabled adapter would enrich it

$("#source").text(pending?.pageTitle ?? "");
$("#title-" + ((await StorageService.readSync(StorageConstants.SETTINGS.LINKS_TITLE_SOURCE)) === "url" ? "url" : "text")).prop("checked", true);
$("input[name=title-source]").on("change", () => StorageService.saveSync(StorageConstants.SETTINGS.LINKS_TITLE_SOURCE, titleSource()));
const titleSource = () => $("input[name=title-source]:checked").val();

// Groups are an adapter site's host (all of its subdomains together) or the link's own host; -> [[group, [links]]], biggest first
async function buildGroups() {
  const groups = new Map();
  for (const link of links) {
    const host = SiteRulesService.normalizeHost(link.url) ?? "(unknown)";
    const found = await AdapterRegistry.findSite(link.url);
    const enrich = found && await AdapterRegistry.enrichingAdapter(link.url);
    const group = found?.site.host ?? host;
    info.set(link, {group, host, adapterName: enrich ? found.adapter.name : null, origin: enrich ? `*://*.${found.site.host}/*` : null});
    groups.set(group, [...(groups.get(group) ?? []), link]);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function updateStatus() {
  const n = [...linkBoxes.values()].filter(box => box.checked).length;
  $("#status").text(`${n} of ${links.length} selected`);
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
  box.checked = pending.selectedByDefault;
  linkBoxes.set(link, box);
  nodesToJoin.forEach(node => node.leaves.push(box));
  $(box).on("change", refresh);
  body.append($('<div class="link-row"></div>').append(box, $("<label></label>").text(link.text || link.url).attr("title", link.url),
      $("<span class='url text-truncate'></span>").text(link.text ? link.url : "")));
}

function renderGroup(group, groupLinks) {
  const adapterName = info.get(groupLinks.find(link => info.get(link).adapterName) ?? groupLinks[0]).adapterName;
  let extra = null;
  if (adapterName) {
    const enrichBox = $('<input type="checkbox" class="mr-1" checked>')[0];
    enrichBoxes.set(group, enrichBox);
    extra = $('<label class="mb-0 ml-3 small" title="Open each link in a background tab and add it like a page, with the adapter title, tags and fields"></label>')
        .append(enrichBox, `Enrich (${adapterName})`);
  }
  const top = makeNode(group, groupLinks, extra);
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
  $("#add, #select-all, #select-none, input").prop("disabled", true);
  const {added, failed, aborted} = await ApiDataService.addLinkTasks(
      chosen,
      {pageTitle: pending.pageTitle, pageUrl: pending.pageUrl, titleSource: titleSource()},
      (done, total, failures) => $("#status").text(`Adding ${done} of ${total}` + (failures ? ` (${failures} failed)` : "") + "…"));
  $("#status").text(`Added ${added} of ${chosen.length}` + (failed ? `, ${failed} failed` : "")
      + (granted ? "" : ". Permission for enrichment was denied, so those were added as plain links")
      + (aborted ? ". Stopped after repeated failures (rate limit or expired login?); the rest were not tried" : "") + ".");
});
