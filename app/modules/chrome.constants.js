export class ChromeConstants {
    static CONTEXT_MENU_TYPES = {
        PAGE: "page",
        SELECTION: "selection",
        LINK: "link",
    };
    // Menu items that open the batch dialog; the id is also the menu item id.
    static LINKS_MENUS = {
        PAGE: {id: "links-page", context: "page", title: "Add links on this page to Quire…"},
        SELECTION: {id: "links-selection", context: "selection", title: "Add links in selected text to Quire…"},
    };
}
