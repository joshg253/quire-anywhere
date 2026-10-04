# Chrome Extension: Quire Anywhere

The source code for [Quire Anywhere](https://chrome.google.com/webstore/detail/quire-anywhere/nojpnnfpfaepolalpokjlblonedknfgf), a chrome extension that easily allows you to add tasks from around the web easily. 


Settings has Site Rules: tasks added from a site (e.g. bandcamp.com) go to the project you choose instead of the default.

Settings has Site Adapters (off until enabled). Enabling one covers its sites (e.g. bandcamp.com) without a Site Rule: each starts on "Default" and can be given its own project, and you can add more sites. Each adapter also has a task title format (e.g. "{name} [{year}]") and Text (single-line) custom field rows (e.g. Year = "{year}", none by default). Bandcamp fills due date, estimate, priority, the year (if you add a field row for it) and tags (with your tag aliases, minus tags you ignore); HowLongToBeat game pages set the title ("Game [year]") and Estimate (Main Story, Main + Extras, Completionist or All Styles).
