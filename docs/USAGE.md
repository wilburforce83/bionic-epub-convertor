# Usage Guide

## First Login

Open the main web app in your browser:

- `http://localhost:3000` by default

Log in with the username and password from your `.env` file:

- `WEBDAV_USERNAME`
- `WEBDAV_PASSWORD`

## Main Areas

Dyslibria has four practical user-facing areas:

- the Library dashboard
- the Upload flow
- Settings and logs
- the Reader

## Library Dashboard

The main screen shows:

- a search bar
- theme toggle
- conversion logs button
- refresh button
- upload button
- settings button
- a collapsible dashboard banner
- the library wall of processed books

### Continue Reading

If you have opened a book before, the dashboard can show:

- the last book you were reading
- saved reading percentage
- last known page label
- a one-click `Resume` action

Reading progress is stored on the server, not just in the browser.

### Search

Use the search bar to filter the library by:

- title
- author

### Dashboard Banner

The top dashboard can be collapsed if you want more room for the library wall.

## Uploading Books

Use the `Upload` button in the top bar.

The upload modal supports:

- file picker upload
- drag and drop
- multiple EPUB files at once

After upload:

- the file is queued for conversion
- the converted EPUB is written into the processed library
- metadata is refreshed
- failed books are quarantined to `failed/`

## Conversion Status and Logs

### Status pill

The top status pill shows whether Dyslibria is:

- idle
- converting now
- holding queued files

### Conversion log viewer

Use `Logs` to view recent conversion activity, including:

- queued jobs
- conversion starts
- conversion completions
- conversion failures
- manual metadata refreshes

You can also clear the in-app log viewer from the UI.

## Settings

Open `Settings` from the top bar.

Current settings available in the UI:

- WebDAV port
- web app / OPDS port
- upload path
- library path
- external base URL
- theme colour
- install Dyslibria on this device

### What each setting does

### WebDAV port

Controls the port used for WebDAV access.

### Web app / OPDS port

Controls the main HTTP port for:

- the browser UI
- OPDS feed
- health checks

### Upload path

Where Dyslibria stages incoming files before conversion.

### Library path

Where converted EPUB files are stored and served from.

### External base URL

Used when Dyslibria generates absolute URLs, especially for OPDS.

### Theme colour

Changes the main accent colour across:

- login
- library
- settings modals
- logs modal
- reader chrome
- PWA surfaces

## Installing as a PWA

The app can be added to a device as a PWA.

To do that:

1. Open `Settings`
2. Click `Install Dyslibria on this device`
3. Use the install prompt or follow the platform-specific instructions

Notes:

- On Android, full install usually needs HTTPS or same-device `localhost`.
- On iPhone and iPad, installation is done with Safari's `Add to Home Screen`.

## Reader Overview

Open a book by clicking its cover in the library or using `Resume` from the dashboard.

The reader is designed as a full-window reading surface.

## Reader Controls

### Tap / click zones

- left edge: previous page
- right edge: next page
- centre area: open display settings
- lower middle area: open reading progress

### Progress panel

The reading progress panel shows:

- book title
- author
- percentage read
- current chapter label
- whole-book page label when available

When the progress panel is open, a `Close book` button appears at the top of the reader.

### Keyboard controls

On desktop:

- `ArrowLeft`: previous page
- `ArrowRight`: next page
- `Escape`: close the current overlay

## Reader Settings

Open reader settings by tapping or clicking the centre of the reading area.

Available reader settings:

- Theme
  - Paper
  - Sepia
  - Midnight
- Font family
  - Accessible sans
  - Bookish serif
  - Classic sans
- Font size
- Line height
- Page spread
  - Auto
  - Always show spreads
  - Single page only
- Reading mode
  - Paginated
  - Continuous scroll

### Important theme behavior

The reader keeps its own reading theme choices such as Paper, Sepia, and Midnight, but it still inherits the app's selected accent colour.

## Reading Progress

Dyslibria saves reading progress automatically to the server while you read.

That means:

- reopening a book resumes from the last saved location
- dashboard progress stays in sync with the reader
- progress survives browser changes on the same server install

## OPDS and WebDAV Access

Processed books are also available outside the web UI.

### OPDS

Feed URL:

- `http://localhost:3000/opds`

Use your normal Dyslibria username and password when prompted.

### WebDAV

Default URL:

- `http://localhost:1900`

Use the same credentials as the main app.

## Failed Books

If a book fails validation or conversion, Dyslibria does not silently publish it.

Instead it is moved to:

- `failed/`

If a book is missing from the library after upload, check:

- the conversion log viewer
- the `failed/` folder

## Mobile and Tablet Notes

- Search stays visible in the top bar
- most other top-bar actions collapse into the menu button
- the dashboard trims down to keep the library wall more prominent
- the reader is designed to work as a full-window experience in browser or PWA mode
