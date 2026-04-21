# Installation Guide

## Overview

Dyslibria has two realistic installation paths:

- Docker: recommended for almost everyone
- Source install: for people who prefer to run Node directly

Dyslibria stores important state on disk. For a real deployment, you should persist at least these folders:

- `uploads/`
- `processed/`
- `db/`
- `failed/`

`temp/` is working space only and does not need to be persisted.

## Docker Installation

### Prerequisites

- Docker Engine and Docker Compose
- A machine that can expose two ports:
  - web app and OPDS: `3000` by default
  - WebDAV: `1900` by default

### 1. Clone the repository

```bash
git clone https://github.com/wilburforce83/bionic-epub-convertor.git
cd bionic-epub-convertor
```

The included `docker-compose.yml` pulls the published image:

- `wilburforce83/dyslibria:latest`

### 2. Start Dyslibria

docker compose pull
docker compose up -d
```

### 3. Open the app

- Web app: `http://localhost:3000`
- WebDAV: `http://localhost:1900`
- OPDS: `http://localhost:3000/opds`

### 4. Complete first-run setup

On a brand-new install:

- sign in with `admin`
- use password `dyslibria`
- create the permanent administrator account in the setup page

After that:

- the bootstrap login stops working
- normal user accounts are managed from the in-app settings page

### Docker volumes used by default

The included `docker-compose.yml` persists these paths:

- `dyslibria_uploads:/usr/src/app/uploads`
- `dyslibria_processed:/usr/src/app/processed`
- `dyslibria_db:/usr/src/app/db`
- `dyslibria_failed:/usr/src/app/failed`

These are Docker named volumes, so you do not need to create host folders just to get started.

To inspect them:

```bash
docker volume ls | grep dyslibria
```

### Optional: override defaults with `.env`

An `.env` file is optional now.

You only need one if you want to override defaults such as:

- custom ports
- a public `BASE_URL`
- a fixed `SESSION_SECRET`
- a pinned Docker image tag

Example:

```bash
cp .env.example .env
```

Useful optional values:

```env
MAIN_PORT=3000
WEBDAV_PORT=1900
BASE_URL=https://books.example.com
IMAGE_TAG=1.0.7
SESSION_SECRET=replace-with-a-long-random-string
```

### Updating a Docker install

```bash
git pull
docker compose pull
docker compose up -d
```

### Stopping the container

```bash
docker compose down
```

This stops the app but keeps your persistent data folders intact.

### Optional: `docker run` example

If you prefer `docker run` instead of Compose:

```bash
docker pull wilburforce83/dyslibria:latest

docker run -d \
  --name dyslibria \
  -p 3000:3000 \
  -p 1900:1900 \
  --restart unless-stopped \
  wilburforce83/dyslibria:latest
```

That works with Dyslibria's defaults and an ephemeral container filesystem.

If you want persistent Docker volumes with `docker run`, add:

```bash
docker run -d \
  --name dyslibria \
  -p 3000:3000 \
  -p 1900:1900 \
  -v dyslibria_uploads:/usr/src/app/uploads \
  -v dyslibria_processed:/usr/src/app/processed \
  -v dyslibria_db:/usr/src/app/db \
  -v dyslibria_failed:/usr/src/app/failed \
  --restart unless-stopped \
  wilburforce83/dyslibria:latest
```

### Optional: build the image yourself

If you are modifying Dyslibria locally and want to build your own image instead of using the published one:

```bash
docker build -t dyslibria .
```

Then replace `wilburforce83/dyslibria:latest` with `dyslibria` in the `docker run` example above, or temporarily edit `docker-compose.yml` to use `build: .`.

## Source Installation

## Prerequisites

- Node.js 20 or newer
- npm

The repository includes an `.nvmrc` file if you use `nvm`.

### 1. Clone the repository

```bash
git clone https://github.com/wilburforce83/bionic-epub-convertor.git
cd bionic-epub-convertor
```

### 2. Install dependencies

```bash
npm install
```

That install also pulls the pinned `dyslibria-converter` package version that powers Dyslibria's EPUB conversion pipeline.

### 3. Create `.env`

```bash
cp .env.example .env
```

Then edit `.env` with the values you want to override:

```env
MAIN_PORT=3000
WEBDAV_PORT=1900
BASE_URL=http://localhost:3000
SESSION_SECRET=replace-with-a-long-random-string
```

### 4. Create working folders

```bash
mkdir -p uploads processed db failed temp
```

### 5. Start the app

```bash
npm start
```

### 6. Optional: run tests

```bash
npm test
```

### 7. Complete first-run setup

On a fresh source install, sign in with:

- username `admin`
- password `dyslibria`

Then create the permanent administrator account in the setup page.

## Persistent Folder Reference

### `uploads/`

Incoming EPUB files are staged here before they are processed.

### `processed/`

This is the actual processed library exposed to:

- the browser UI
- OPDS clients
- WebDAV clients

If you point this at an existing library location, be deliberate. This is the most important content folder in the app.

### `db/`

This contains Dyslibria state, including:

- app settings
- metadata cache
- reading progress
- user accounts
- generated runtime secret data

### `failed/`

Files that fail validation or conversion are moved here instead of being published.

### `temp/`

Temporary extraction and conversion workspace. Do not treat it as permanent storage.

## Reverse Proxy / External Access

If you want Dyslibria reachable outside your LAN:

- put it behind HTTPS
- set `BASE_URL` to the public URL users and OPDS clients will actually use

Example:

```env
BASE_URL=https://books.example.com
```

If your public URL includes a non-standard port, include it:

```env
BASE_URL=https://books.example.com:8443
```

## PWA Note

For full Android PWA installation from another device, you generally need HTTPS or the app must be accessed as `localhost` on the same device. Plain HTTP over a LAN IP usually falls back to `Add to Home Screen` style behavior instead of full install.

## Troubleshooting

### The app refuses to start

Check these first:

- the container can bind to ports `3000` and `1900`
- the `db/` path or Docker volume is writable
- the Docker image pulled correctly
- for source installs, Node.js 20 or newer is available

### Login works but assets look stale

Refresh once or twice after updates so the latest PWA assets take over.

### A book never appears in the library

Check:

- the in-app conversion log viewer
- the `failed/` folder

### OPDS links point at the wrong address

Your `BASE_URL` is wrong or missing.

### I do not want to use the bootstrap login

That is only used for the first run.

After you create the permanent administrator account:

- `admin` / `dyslibria` stops working
- real access is controlled entirely from Dyslibria's user management page
