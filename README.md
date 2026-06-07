# YT Skip Watched

Chrome extension that hides, dims, or auto-skips YouTube videos you've already watched, detected by the red progress bar on the thumbnail.

![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green)

YouTube keeps recommending things you've already seen. This removes them from the picture. No build step, no dependencies, no tracking. Just a content script and a popup.

## Features

- **Hide or dim** already-watched videos in lists (dim keeps them visible but faded, restored on hover)
- **Auto-skip in queue**: when a Mix or playlist lands on a watched track, jumps straight to the next unwatched one
- **Auto-skip on autoplay** (experimental): on a watch page, moves to the next unwatched related video
- **Watched threshold**: set how much of the red bar counts as "watched" (1-95%)
- **Per-surface control**: turn it on or off independently for Home, Search, Subscriptions, Channel, and Related
- **Whitelist**: artists, channels, or keywords that are never hidden or skipped
- **Stats**: videos hidden on the current page, plus running totals for hidden and skipped
- **Master toggle** to disable everything at once
- Detects both the old (`#progress`) and new (web component) YouTube progress bars
- English and Brazilian Portuguese (`chrome.i18n`, follows the browser language)

## Stack

| Component | Technology |
|---|---|
| Manifest | Chrome Manifest V3 |
| Content script | Vanilla JavaScript |
| Popup | HTML + CSS + vanilla JavaScript |
| Storage | `chrome.storage.sync` (settings) + `chrome.storage.local` (stats) |
| i18n | `chrome.i18n` (`en`, `pt_BR`) |

## Install

Not on the Chrome Web Store. Load it unpacked:

```bash
git clone https://github.com/gabrielcnb/yt-skip-watched
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the cloned folder
4. Open YouTube and click the extension icon to adjust settings

## How it works

YouTube draws a red progress bar over the thumbnail of videos you've started. The content script reads that bar's width as a percentage across the surfaces YouTube uses (Home, search, related, Mix queue, the newer web-component cards), and treats anything past the threshold as watched. From there it either hides the card, dims it, or (in a player queue) advances to the next unwatched item. Everything is driven by the DOM; nothing is sent anywhere.

## License

[MIT](LICENSE)
