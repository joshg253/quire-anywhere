import {StorageService} from "../../modules/storage.service.js";
import {LoginDataService} from "../../modules/login.data.service.js";
import {ApiDataService} from "../../modules/api.data.service.js";
import {TranslationService} from "../../modules/translation.service.js";
import {TranslationConfig} from "../../modules/translation.config.js";
import {AppStatusKeys} from "../../modules/app.status.keys.js";

function showPopulateDefaultTable() {
  const orgName = StorageService.readLocal('default_org_name');
  const projName = StorageService.readLocal('default_proj_name');
  if (orgName && projName) {
    $('#default-org').html(orgName);
    $('#default-proj').html(projName);
    $('#table-container').removeClass('d-none');
  } else {
    $("#warning-warn-body").html(TranslationService.translateFromKey(TranslationConfig.SETTINGS, "default-project-missing"));
    $("#warning-warn").removeClass('d-none');
  }
}

function showLoggedIn() {
  document.body.classList.remove("login");
  $("#logged-in-container").removeClass('d-none');
  $("#login-container").addClass('d-none');
  $("#open-settings").removeClass('disabled');
  showPopulateDefaultTable();
}

function handleResponse(response) {
  if(response) {
    if (response.status === AppStatusKeys.TOKEN_SUCCESS) {
      $("#success-warn-body").html(TranslationService.translateFromKey(TranslationConfig.AUTHENTICATION_RESPONSE, response.status));
      $("#success-warn").removeClass('d-none');
      showLoggedIn();
    } else if (response.status !== AppStatusKeys.HTTP_ERROR) {
      $("#error-warn-body").html(TranslationService.translateFromKey(TranslationConfig.AUTHENTICATION_RESPONSE, response.status));
      $("#error-warn").removeClass('d-none');
    }
  }
}

// try to load login data onload
const loginDataService = new LoginDataService();
loginDataService.isLoggedIn(function (loggedIn) {
  if (!loggedIn) {
    console.log("logging in");
    loginDataService.attemptLogin(handleResponse);
  } else {
    console.log("logged in");
    showLoggedIn();
  }
});


document.querySelector('#get-token').addEventListener('click', function () {
  document.querySelector('#access-token').innerHTML = ApiDataService.getToken();
});

document.querySelector('#logout-button').addEventListener('click', function () {
  StorageService.clearAllStorage();
  // wait for storage to clear
  setTimeout(function() {
    window.close();
  }, 300)
});
const settingsButton = $('#open-settings');
settingsButton.on('click', function() {
  if (settingsButton.hasClass('disabled')) {
    $("#error-warn-body").html(TranslationService.translateFromKey(TranslationConfig.SETTINGS, "not-signed-in"));
    $("#error-warn").removeClass('d-none');
  } else {
    window.open(chrome.runtime.getURL('/views/settings/settings.html'));
  }
});

document.querySelector("#login-button").addEventListener("click", function () {
  // Ask a Quire User to Grant Access to Your Application
  loginDataService.saveState(function () {
    window.open(loginDataService.authUrl);
  });
});

// hide instead of delete warns
$(document).on('click', '.alert-close', function() {
  $(this).parent().addClass('d-none');
});
