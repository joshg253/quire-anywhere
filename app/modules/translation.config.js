import {AppStatusKeys} from "./app.status.keys.js";

export class TranslationConfig extends AppStatusKeys {
  static CONTEXT_MENU = "context-menu";
  static AUTHENTICATION_RESPONSE = "authentication-response";
  static _translations = {
    [this.CONTEXT_MENU]: {
      "selection": "selected text",
      "page": "this page",
      "link": "this link",
      "image": "this image",
      "video": "this video",
      "audio": "audio",
      "default": "this page"
    },
    [this.AUTHENTICATION_RESPONSE]: {
      [this.ACCESS_CODE_DENIED]: "You denied access, please sign in again",
      [this.TOKEN_SUCCESS]: "You have successfully logged in!",
      [this.TOKEN_DENIED]: "Something went wrong validating the response... try again?",

      [this.JSON_ERROR]: "Something went wrong reading the response... try again?",
      [this.HTTP_ERROR]: "Something went wrong getting the response... try again?",
      "default": "Unknown error... try again?"
    }
  };
}