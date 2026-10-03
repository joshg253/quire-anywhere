import {ApiDataService} from "../../modules/api.data.service.js";
import {StorageService} from "../../modules/storage.service.js";
import {StorageConstants} from "../../modules/storage.constants.js";
import {ChromeService} from "../../modules/chrome.service.js";
import {SiteRulesService} from "../../modules/site.rules.service.js";


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
