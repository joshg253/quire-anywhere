import {ApiDataService} from "../../modules/api.data.service.js";
import {StorageService} from "../../modules/storage.service.js";
import {StorageConstants} from "../../modules/storage.constants.js";
import {ChromeService} from "../../modules/chrome.service.js";
import {SiteRulesService} from "../../modules/site.rules.service.js";
import {AdapterRegistry} from "../../modules/adapter.registry.js";
import {AdapterSettingsService} from "../../modules/adapter.settings.service.js";


$('#version').text(ChromeService.getVersionName());

$('#proj-select').on('change', function () {
  hideProjectRequired();
});

$('#submit').on('click', function () {
  const serializedArray = $('#settings-form').serializeArray();
  console.log(serializedArray);
  console.log(ApiDataService.saveProjectAndOrganizationFromSelectMenuAsDefaultIds);
  ApiDataService.saveProjectAndOrganizationFromSelectMenuAsDefaultIds(serializedArray,
      function () {
    showProjectRequired(true);
  }, function () {
    showSuccessAlert();
    validateDefaultProjectSelect();
  });

});

// load organizations
ApiDataService.getAllOrganizations(async function(orgs) {
  let allOrgs = {};
  for (let i in orgs) {
    allOrgs[orgs[i].oid] = orgs[i];
  }
  await StorageService.saveLocal(StorageConstants.QUIRE.ALL_ORGANIZATIONS, JSON.stringify(allOrgs));
});

// load projects
ApiDataService.getAllProjects(async function (projects) {
  await ApiDataService.fillSelectMenu(projects, $("#proj-select"));
  await initialize();
});

async function initialize() {


  const defaultProjId = await StorageService.readLocal(StorageConstants.SETTINGS.DEFAULT_PROJ_ID);
  const defaultOrgId = await StorageService.readLocal(StorageConstants.SETTINGS.DEFAULT_ORG_ID);

  if (defaultOrgId && defaultProjId) {
    $("#proj-select").val(`${defaultOrgId}/${defaultProjId}`);
  }
  showDefaultProjectSelect();
  await initializeSiteRules();
  await renderAdapters();
  validateDefaultProjectSelect(!(defaultOrgId || defaultProjId));
}

function showDefaultProjectSelect() {
  $("#loading-container").addClass("d-none");
  $("#project-settings-options-container").removeClass("d-none");
}

function validateDefaultProjectSelect(firstTime) {
  let isDefaultOptionSelected = $("#project-settings-options-container select option:selected")[0].disabled;
  if (firstTime || isDefaultOptionSelected) {
    showProjectRequired();
    return false;
  } else {
    hideProjectRequired();
    return true;
  }
}

function showProjectRequired(buttonClicked) {
  $("#project-description").addClass('d-none');
  $("#project-required").removeClass('d-none');
  if (buttonClicked) {
    markButtonAsError();
  } else {
    markButtonAsInvalid();
  }
}

function hideProjectRequired() {
  $("#project-description").removeClass('d-none');
  $("#project-required").addClass('d-none');
  markButtonAsPrimary();
}

function markButtonAsError() {
  $("#submit")
      .addClass("btn-outline-danger")
      .removeClass("btn-outline-secondary")
      .removeClass("btn-outline-primary");
}

function markButtonAsInvalid() {
  $("#submit")
      .removeClass("btn-outline-danger")
      .addClass("btn-outline-secondary")
      .removeClass("btn-outline-primary");
}

function markButtonAsPrimary() {
  $("#submit")
      .removeClass("btn-outline-danger")
      .removeClass("btn-outline-secondary")
      .addClass("btn-outline-primary");
}

function showSuccessAlert() {
  const successAlert = $("#success-alert");
  successAlert.removeClass('d-none');
  successAlert.fadeTo(2000, 500).slideUp(500, function() {
    successAlert.slideUp(500);
  });
}

ChromeService.registerStorageListener(quireLoggedInHandler, StorageConstants.QUIRE.LOGGED_IN);
function quireLoggedInHandler(loggedIn) {
  if (loggedIn === StorageConstants.FALSE) {
    window.close();
  }
}

// SITE RULES
async function initializeSiteRules() {
  const ruleProjectSelect = $("#rule-proj");
  $("#proj-select option").not(":disabled").each(function () {
    ruleProjectSelect.append(new Option($(this).text(), $(this).val().split("/")[1]));
  });
  $("#site-rules-container").removeClass("d-none");
  await renderSiteRules();
}

async function renderSiteRules() {
  const list = $("#site-rules-list").empty();
  for (const rule of await SiteRulesService.getRules()) {
    const projName = $(`#rule-proj option[value="${CSS.escape(rule.projId)}"]`).text() || "(project unavailable)";
    const removeButton = $('<button type="button" class="btn btn-sm btn-outline-secondary">Remove</button>')
        .on("click", () => removeSiteRule(rule.host));
    list.append($("<tr>")
        .append($("<td>").text(rule.host))
        .append($("<td>").text(projName))
        .append($('<td class="text-right">').append(removeButton)));
  }
}

$("#rule-add").on("click", async function () {
  const host = SiteRulesService.normalizeHost($("#rule-host").val());
  const projId = $("#rule-proj").val();
  if (!host || !projId) {
    $("#rule-invalid").removeClass("d-none");
    return;
  }
  $("#rule-invalid").addClass("d-none");
  const rules = (await SiteRulesService.getRules()).filter(rule => rule.host !== host);
  rules.push({host, projId});
  await SiteRulesService.saveRules(rules);
  $("#rule-host").val("");
  await renderSiteRules();
});

async function removeSiteRule(host) {
  await SiteRulesService.saveRules((await SiteRulesService.getRules()).filter(rule => rule.host !== host));
  await renderSiteRules();
}

// SITE ADAPTERS
async function renderAdapters() {
  const list = $("#adapters-list").empty();
  for (const adapter of AdapterRegistry.adapters) {
    list.append(await buildAdapterCard(adapter));
  }
  $("#adapters-container").removeClass("d-none");
}

async function updateAdapterSettings(adapter, change) {
  const settings = await AdapterSettingsService.get(adapter);
  change(settings);
  await AdapterSettingsService.save(adapter, settings);
}

// Everything but the on/off switch stays hidden until the adapter is enabled.
async function buildAdapterCard(adapter) {
  const settings = await AdapterSettingsService.get(adapter);
  const body = $('<div class="card-body border-top">').toggleClass("d-none", !settings.enabled);
  const toggle = $(`<input type="checkbox" class="custom-control-input" id="adapter-${adapter.id}">`).prop("checked", settings.enabled);
  toggle.on("change", async function () {
    const enabled = this.checked;
    body.toggleClass("d-none", !enabled);
    await updateAdapterSettings(adapter, s => s.enabled = enabled);
  });
  for (const option of adapter.options ?? []) {
    body.append(buildAdapterOption(adapter, option, settings.options[option.key]));
  }
  if (adapter.tagCandidates) {
    body.append(await buildAliasEditor(adapter));
  }
  return $('<div class="card mb-3">')
      .append($('<div class="card-header custom-control custom-switch ml-3 border-0 bg-transparent">')
          .append(toggle)
          .append($(`<label class="custom-control-label font-weight-bold" for="adapter-${adapter.id}">`).text(adapter.name)))
      .append(body);
}

function buildAdapterOption(adapter, option, value) {
  const select = $('<select class="custom-select">');
  for (const choice of option.choices) {
    select.append(new Option(choice.label, choice.value));
  }
  select.val(value).on("change", () => updateAdapterSettings(adapter, s => s.options[option.key] = select.val()));
  return $('<div class="form-group">').append($("<label>").text(option.label)).append(select);
}

async function buildAliasEditor(adapter) {
  const rows = $("<tbody>");
  const textInput = $('<input type="text" class="form-control" placeholder="e.g. Los Angeles, California">');
  const tagInput = $('<input type="text" class="form-control" placeholder="e.g. L.A.">');
  const invalid = $('<div class="alert alert-danger small d-none" role="alert">Enter both the page text and your tag.</div>');

  async function render() {
    rows.empty();
    for (const alias of (await AdapterSettingsService.get(adapter)).aliases) {
      const removeButton = $('<button type="button" class="btn btn-sm btn-outline-secondary">Remove</button>').on("click", async () => {
        await updateAdapterSettings(adapter, s => s.aliases = s.aliases.filter(other => other.text !== alias.text));
        await render();
      });
      rows.append($("<tr>")
          .append($("<td>").text(alias.text))
          .append($("<td>").text(alias.tag))
          .append($('<td class="text-right">').append(removeButton)));
    }
  }

  const addButton = $('<button type="button" class="btn btn-outline-primary">Add</button>').on("click", async () => {
    const text = textInput.val().trim();
    const tag = tagInput.val().trim();
    invalid.toggleClass("d-none", !!(text && tag));
    if (!text || !tag) {
      return;
    }
    await updateAdapterSettings(adapter, s => {
      s.aliases = s.aliases.filter(alias => alias.text.toLowerCase() !== text.toLowerCase());
      s.aliases.push({text, tag});
    });
    textInput.val("");
    tagInput.val("");
    await render();
  });

  await render();
  return $("<div>")
      .append($("<h6>Tag Aliases</h6>"))
      .append($("<p class=\"small text-muted\">When a page's tag or location matches the text on the left (not case sensitive), " +
          "your tag on the right is used instead.</p>"))
      .append($('<table class="table table-sm">').append(rows))
      .append($('<div class="input-group mb-3">').append(textInput).append(tagInput)
          .append($('<div class="input-group-append">').append(addButton)))
      .append(invalid);
}
