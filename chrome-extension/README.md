# Chrome Extension: Portfolio Screenshot Importer

## What it does

1. User scrolls asset rows into view in browser
2. Click `Capture + Parse` (single step)
3. Extension captures current browser view and immediately parses
4. Show extracted holdings in form rows for user confirmation/edit
5. Confirm and merge into user's portfolio

## Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `FinTech/chrome-extension`

## Required backend endpoints

- `POST /users/{user_id}/imports/screenshot/parse`
- `POST /users/{user_id}/imports/screenshot/confirm`

## Notes

- This version uses `user_id` only (no auth/login).
- Capture is simple browser viewport capture (`chrome.tabs.captureVisibleTab`).
- For best results, scroll your assets table fully into view before capture.
