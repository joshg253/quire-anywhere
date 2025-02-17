import {StorageService} from "./storage.service.js";
import {ApiConfig} from "./api.config.js";
import {ApiHttpService} from "./api.http.service.js";
import {Task} from "../models/task.model.js";
import {StorageConstants} from "./storage.constants.js";
import {ChromeService} from "./chrome.service.js";
import {ApiFormatterService} from "./api.formatter.service.js";
import {AppUtils} from "./app.utils.js";

export class ApiDataService {
  constructor() {}

  // GET FROM STORAGE
  static getToken() {
    return StorageService.readLocal(StorageConstants.QUIRE.ACCESS_TOKEN)
  }
  
  static getDefaultProjectId() {
    return StorageService.readLocal(StorageConstants.SETTINGS.DEFAULT_PROJ_ID);
  }
  
  static getDefaultOrganizationId() {
    return StorageService.readLocal(StorageConstants.SETTINGS.DEFAULT_ORG_ID);
  }

  // GET FROM QUIRE
  static getProjectsByOrganization(organizationId, projectsFunction) {
    // Currently broken, 404 error
    const url = ApiConfig.getProjectsByOrganizationUrl.replace("{organizationOid}", organizationId);
    ApiHttpService.getFromQuire(url, this.getToken(), function(response) {
      projectsFunction(response);
    });
  }

  static getAllOrganizations(orgsFunction) {
    ApiHttpService.getFromQuire(ApiConfig.getAllOrganizationsUrl, this.getToken(), function(response) {
      orgsFunction(response);
    });
  }

  static getAllProjects(projectsFunction) {
    const url = ApiConfig.getAllProjectsUrl;
    ApiHttpService.getFromQuire(url, this.getToken(), function(response) {
      projectsFunction(response);
    });
  }

  // POST TO QUIRE
  static postTaskIntoProject(task, project_id) {
    const url = ApiConfig.postNewTaskUrl.replace("{projectId}", project_id);
    const allProjects = JSON.parse(StorageService.readLocal(StorageConstants.QUIRE.ALL_PROJECTS));
    const defaultProjName = allProjects[project_id].name;
    return new Promise((resolve) => {
      ApiHttpService.postToQuire(url, this.getToken(), "Bearer", task.toJSON(),function(task) {
        StorageService.addTaskToHistory(task);
        ChromeService.createNotification(
            task.oid,
            `Task added`,
            `to ${defaultProjName}\nClick to open`
        );
        resolve(true);
      });
    });
  }

  static deleteTaskByOid(taskOid) {
    const url = ApiConfig.deleteTaskByOidUrl.replace("{taskOid}", taskOid);
    const token = this.getToken();
    return new Promise(async function (resolve, reject) {
      const response = await ApiHttpService.deleteToQuire(url, token);
      if (response.ok) {
        resolve();
      } else {
        console.warn(`Failed to delete task by OID: ${taskOid}`)
        reject(response);
      }
    });
  }

  // ADD (and then post)
  static addPageTask(tab) {
    console.log("Adding page to Quire...");
    const proj_id = this.getDefaultProjectId();
    // let task = new Task(ApiFormatterService.formatHyperlink(tab.title, tab.url), ApiFormatterService.formatHyperlink(tab.url));
    let task = new Task(tab.title, tab.url);
    ApiDataService.postTaskIntoProject(task, proj_id);
    // debug
    console.log(`Page url: ${tab.url}`);
    console.log(`Page title: ${tab.title}`);
    console.log(`Access token: ${this._accessToken}`);
    console.log("org_id" + this.getDefaultOrganizationId());
    console.log(`proj_id: ${proj_id}`);
  }

  static addSelectionTask(info, tab) {
    console.log("Adding selection to Quire...");

    const proj_id = this.getDefaultProjectId();
    let task = new Task(info.selectionText, "From: " + ApiFormatterService.formatHyperlink(tab.title, tab.url));
    ApiDataService.postTaskIntoProject(task, proj_id);
    // debug
    console.log("Text: " + info.selectionText);
    console.log("From: " + tab.url);
    console.log(`Access token: ${this._accessToken}`);
    console.log("org_id" + this.getDefaultOrganizationId());
    console.log(`proj_id: ${proj_id}`);
  }

  static addLinkTask(info, tab) {
    console.log("Adding link to Quire...");

    const proj_id = this.getDefaultProjectId();
    let task = new Task(
        ApiFormatterService.formatHyperlink(info.linkUrl, tab.url),
        "From: " + ApiFormatterService.formatHyperlink(tab.title, tab.url)
    );
    ApiDataService.postTaskIntoProject(task, proj_id);
    // debug
    console.log("Link: " + info.linkUrl);
    console.log("From: " + tab.url);
    console.log(`Access token: ${this._accessToken}`);
    console.log("org_id" + this.getDefaultOrganizationId());
    console.log(`proj_id: ${proj_id}`);
  }

  static getExpireInAsDateString(expires_in) {
    if (Number.isInteger(expires_in)) {
      var dt = new Date();
      dt.setSeconds( dt.getSeconds() + expires_in);
      return dt.toString();
    } else {
      console.throw(`Expected expires_in ${expires_in} to be an Integer`);
      return null;
    }
  }

  // HTML INJECTION
  static fillSelectMenu(projects, projSelect) {
    let allProjects = {};
    for (const p of projects) {
      allProjects[p.oid] = p;
    }
    for (const p of projects) {
      const option = document.createElement("option");
      const org = p.organization;
      const projId = p.oid;
      const projName = AppUtils.formatProjectName(projId, p.name);
      if (org) {
        const orgId = org.oid;
        const orgName = org.name;
        option.text = `${orgName} - ${projName}`;
        option.value = `${orgId}/${projId}`;
        projSelect.append(option);
      } else if (projId && projName) {
        option.text = `${projName}`;
        option.value = `/${projId}`;
        projSelect.append(option);
      } else {
        alert("Could not load any projects, please sign in!");
      }
    }
    projSelect.html(projSelect.find('option').sort(function(x, y) {
      if ($(x).disabled) return -1;
      if (AppUtils.isProjectOidMyTasks($(x).val().split("/")[1])) return -1;
      return $(x).text().toLowerCase() > $(y).text().toLowerCase() ? 1 : -1;
    }));


    StorageService.saveLocal(StorageConstants.QUIRE.ALL_PROJECTS, JSON.stringify(allProjects));
  }

  static saveProjectAndOrganizationFromSelectMenuAsDefaultIds(serializedArray, projectRequiredCallback, successCallback) {
    // compile into one object
    let formData = [];
    for (const i in serializedArray) {
      formData[serializedArray[i].name] = serializedArray[i].value;
    }
    if (!formData["org-id/proj-id"]) {
      projectRequiredCallback(true);
    } else {
      const orgIdProjId = formData['org-id/proj-id'].split('/');
      const orgId = orgIdProjId[0];
      const projId = orgIdProjId[1];
      StorageService.saveLocal(StorageConstants.SETTINGS.DEFAULT_PROJ_ID, projId);
      StorageService.saveLocal(StorageConstants.SETTINGS.DEFAULT_ORG_ID, orgId);
      successCallback();
    }
  }
}

