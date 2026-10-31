import {StorageService} from "./storage.service.js";
import {ApiConfig} from "./api.config.js";
import {ApiHttpService} from "./api.http.service.js";
import {Task} from "../models/task.model.js";
import {StorageConstants} from "./storage.constants.js";
import {ChromeService} from "./chrome.service.js";
import {AppUtils} from "./app.utils.js";
import {AdapterRegistry} from "./adapter.registry.js";
import {TagMatcher} from "./tag.matcher.js";

export class ApiDataService {
  static _tagCreations = new Map();

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
  static async getProjectsByOrganization(organizationId, projectsFunction) {
    // Currently broken, 404 error
    const url = ApiConfig.getProjectsByOrganizationUrl.replace("{organizationOid}", organizationId);
    ApiHttpService.getFromQuire(url, await this.getToken(), function(response) {
      projectsFunction(response);
    });
  }

  static async getAllOrganizations(orgsFunction) {
    ApiHttpService.getFromQuire(ApiConfig.getAllOrganizationsUrl, await this.getToken(), function(response) {
      orgsFunction(response);
    });
  }

  // The project's tags as [{oid, name}], or null if they couldn't be loaded
  static async getProjectTags(projectId) {
    const url = ApiConfig.getProjectTagsUrl.replace("{projectOid}", projectId);
    const token = await this.getToken();
    return new Promise(resolve => {
      ApiHttpService.getFromQuire(url, token, response => resolve(Array.isArray(response) ? response : null));
    });
  }

  // Creates a tag in the project (one request per project and name, even when tasks are added concurrently). -> its oid, or null
  static createProjectTag(projectId, name) {
    const key = `${projectId}/${TagMatcher.normalize(name)}`;
    if (!this._tagCreations.has(key)) {
      this._tagCreations.set(key, (async () => {
        const url = ApiConfig.createTagUrl.replace("{projectOid}", projectId);
        const token = await this.getToken();
        return new Promise(resolve => {
          ApiHttpService.postToQuire(url, token, "Bearer", JSON.stringify({name}), created => resolve(created?.oid ?? null));
        });
      })());
    }
    return this._tagCreations.get(key);
  }

  static async getAllProjects(projectsFunction) {
    const url = ApiConfig.getAllProjectsUrl;
    ApiHttpService.getFromQuire(url, await this.getToken(), function(response) {
      projectsFunction(response);
    });
  }

  // POST TO QUIRE
  static async postTaskIntoProject(task, project_id, notify = true) {
    const url = ApiConfig.postNewTaskUrl.replace("{projectId}", project_id);
    const allProjects = JSON.parse(await StorageService.readLocal(StorageConstants.QUIRE.ALL_PROJECTS));
    const defaultProjName = allProjects[project_id].name;
    const token = await this.getToken();
    return new Promise((resolve) => {
      ApiHttpService.postToQuire(url, token, "Bearer", task.toJSON(), async function(created) {
        if (!created?.oid) {
          console.warn("Quire did not create the task", created);
          resolve(false);
          return;
        }
        await StorageService.addTaskToHistory(created);
        if (notify) {
          ChromeService.createNotification(
              created.oid,
              `Task added`,
              `to ${defaultProjName}\nClick to open`
          );
        }
        resolve(true);
      });
    });
  }

  static async deleteTaskByOid(taskOid) {
    const url = ApiConfig.deleteTaskByOidUrl.replace("{taskOid}", taskOid);
    const token = await this.getToken();
    const response = await ApiHttpService.deleteToQuire(url, token);
    if (!response.ok) {
      console.warn(`Failed to delete task by OID: ${taskOid}`)
      throw response;
    }
  }

  // ADD (and then post)
  static async addPageTask(tab) {
    console.log("Adding page to Quire...");
    const defaultProjId = await this.getDefaultProjectId();
    const proj_id = await AdapterRegistry.resolveProjectId(tab.url, defaultProjId);
    await this.postEnrichedTask(tab, proj_id, await AdapterRegistry.enrichTab(tab), true);
    // debug
    console.log(`Page url: ${tab.url}`);
    console.log(`Page title: ${tab.title}`);
    console.log(`Access token: ${this._accessToken}`);
    console.log("org_id" + await this.getDefaultOrganizationId());
    console.log(`proj_id: ${proj_id}`);
  }

  // Posts the tab's page as a task with what the adapter found, retrying with less when Quire rejects it. -> whether a task was created
  static async postEnrichedTask(tab, proj_id, {fields, links, customFields, tagCandidates, title, aliases, ignoredTags}, notify) {
    const pageUrl = await AdapterRegistry.cleanUrl(tab.url);
    let description = [pageUrl, ...links].join("\n");
    if (tagCandidates) {
      const projectTags = await this.getProjectTags(proj_id);
      if (projectTags) {
        const {oids, unmatched, create} = TagMatcher.match(tagCandidates, projectTags, aliases, ignoredTags);
        // Only tags the user named as an alias target are created; one that can't be created is listed with the unmatched
        for (const name of create) {
          const oid = await this.createProjectTag(proj_id, name);
          oid ? oids.push(oid) : unmatched.push(name);
        }
        if (oids.length > 0) {
          fields.tags = oids;
        }
        if (unmatched.length > 0) {
          description += `\n\nTags: ${unmatched.join(", ")}`;
        }
      }
    }
    // Quire rejects the whole task for a field the project doesn't have, so fall back to less rather than lose the task
    const attempts = [
      {description, fields: {...fields, ...customFields}},
      {description, fields},
      {description: [pageUrl, ...links].join("\n"), fields: {}},
    ].filter((attempt, i, all) => i === all.findIndex(other => JSON.stringify(other) === JSON.stringify(attempt)));
    for (const attempt of attempts) {
      const task = new Task(title ?? tab.title, attempt.description);
      task.addFields(attempt.fields);
      if (await ApiDataService.postTaskIntoProject(task, proj_id, notify)) {
        return true;
      }
      console.warn("Retrying with fewer fields");
    }
    return false;
  }

  static async addSelectionTask(info, tab) {
    console.log("Adding selection to Quire...");

    const proj_id = await AdapterRegistry.resolveProjectId(tab.url, await this.getDefaultProjectId());
    let task = new Task(info.selectionText, `From: ${tab.title} - ${await AdapterRegistry.cleanUrl(tab.url)}`);
    ApiDataService.postTaskIntoProject(task, proj_id);
    // debug
    console.log("Text: " + info.selectionText);
    console.log("From: " + tab.url);
    console.log(`Access token: ${this._accessToken}`);
    console.log("org_id" + await this.getDefaultOrganizationId());
    console.log(`proj_id: ${proj_id}`);
  }

  static async addLinkTask(info, tab) {
    console.log("Adding link to Quire...");

    const proj_id = await AdapterRegistry.resolveProjectId(tab.url, await this.getDefaultProjectId());
    let task = new Task(
        await AdapterRegistry.cleanUrl(info.linkUrl),
        `From: ${tab.title} - ${await AdapterRegistry.cleanUrl(tab.url)}`
    );
    ApiDataService.postTaskIntoProject(task, proj_id);
    // debug
    console.log("Link: " + info.linkUrl);
    console.log("From: " + tab.url);
    console.log(`Access token: ${this._accessToken}`);
    console.log("org_id" + await this.getDefaultOrganizationId());
    console.log(`proj_id: ${proj_id}`);
  }

  // One task per link, with no per-task notification; onProgress(done, total, failed) after each. Links marked `enrich` are loaded in
  // background tabs (ENRICH_CONCURRENCY at a time) and posted like a page task, falling back to a plain link task; the rest are posted
  // one at a time. Gives up after MAX_CONSECUTIVE_FAILURES in a row (rate limit, expired login). titleSource "text" uses the link text,
  // falling back to the URL. -> {added, failed, aborted}
  static async addLinkTasks(links, {pageTitle, pageUrl, titleSource}, onProgress) {
    const MAX_CONSECUTIVE_FAILURES = 3;
    const ENRICH_CONCURRENCY = 3;
    const defaultProjId = await this.getDefaultProjectId();
    const cleanPageUrl = await AdapterRegistry.cleanUrl(pageUrl);
    let added = 0, failed = 0, streak = 0, next = 0;

    const addOne = async (link) => {
      const projId = await AdapterRegistry.resolveProjectId(link.url, defaultProjId);
      const enrichment = link.enrich ? await AdapterRegistry.enrichInBackgroundTab(link.url) : null;
      if (enrichment && await this.postEnrichedTask(enrichment.tab, projId, enrichment.enriched, false)) {
        return true;
      }
      const url = await AdapterRegistry.cleanUrl(link.url);
      const task = new Task(titleSource === "text" && link.text ? link.text : url, `${url}

From: ${pageTitle} - ${cleanPageUrl}`);
      return ApiDataService.postTaskIntoProject(task, projId, false);
    };
    const worker = async () => {
      while (next < links.length && streak < MAX_CONSECUTIVE_FAILURES) {
        if (await addOne(links[next++])) {
          added++;
          streak = 0;
        } else {
          failed++;
          streak++;
        }
        onProgress?.(added + failed, links.length, failed);
      }
    };
    // Plain links go through one worker (like before); with enrichment, a few at a time since each waits on a page load
    const workers = links.some(link => link.enrich) ? ENRICH_CONCURRENCY : 1;
    await Promise.all(Array.from({length: workers}, worker));
    return {added, failed, aborted: streak >= MAX_CONSECUTIVE_FAILURES};
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
  static async fillSelectMenu(projects, projSelect) {
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


    await StorageService.saveLocal(StorageConstants.QUIRE.ALL_PROJECTS, JSON.stringify(allProjects));
  }

  static async saveProjectAndOrganizationFromSelectMenuAsDefaultIds(serializedArray, projectRequiredCallback, successCallback) {
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
      // issued together: the popup can close mid-save (window.onblur)
      await Promise.all([
        StorageService.saveLocal(StorageConstants.SETTINGS.DEFAULT_PROJ_ID, projId),
        StorageService.saveLocal(StorageConstants.SETTINGS.DEFAULT_ORG_ID, orgId),
      ]);
      successCallback();
    }
  }
}

