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

### 2. Create your environment file

Copy the example file:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```env
MAIN_PORT=3000
WEBDAV_PORT=1900
WEBDAV_USERNAME=change-this
WEBDAV_PASSWORD=change-this-too
SESSION_SECRET=replace-with-a-long-random-secret
BASE_URL=http://localhost:3000
```

Notes:

- `WEBDAV_USERNAME` and `WEBDAV_PASSWORD` are also used for normal web login.
- `SESSION_SECRET` should be long and random.
- `BASE_URL` should be the external URL that readers and OPDS clients should use.
- If you publish Dyslibria behind a reverse proxy or public domain, set `BASE_URL` to that full external URL.
- To pin a specific Docker image release, set `IMAGE_TAG` in `.env`, for example `IMAGE_TAG=v1.0.0`.

### 3. Create persistent folders

```bash
mkdir -p uploads processed db failed
```

### 4. Start Dyslibria

```bash
docker compose pull
docker compose up -d
```

### 5. Open the app

- Web app: `http://localhost:3000`
- WebDAV: `http://localhost:1900`
- OPDS: `http://localhost:3000/opds`

### Docker volumes used by default

The included `docker-compose.yml` persists these paths:

- `./uploads:/usr/src/app/uploads`
- `./processed:/usr/src/app/processed`
- `./db:/usr/src/app/db`
- `./failed:/usr/src/app/failed`

These are the folders you should back up.

The Compose file also supports:

- `IMAGE_TAG=latest` by default

That lets you track `latest` or pin a specific release such as `v1.0.0`.

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
  --env-file .env \
  -v "$(pwd)/uploads:/usr/src/app/uploads" \
  -v "$(pwd)/processed:/usr/src/app/processed" \
  -v "$(pwd)/db:/usr/src/app/db" \
  -v "$(pwd)/failed:/usr/src/app/failed" \
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

### 3. Create `.env`

```bash
cp .env.example .env
```

Then edit `.env` with your real values:

```env
MAIN_PORT=3000
WEBDAV_PORT=1900
WEBDAV_USERNAME=change-this
WEBDAV_PASSWORD=change-this-too
SESSION_SECRET=replace-with-a-long-random-secret
BASE_URL=http://localhost:3000
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

- `.env` exists
- `WEBDAV_USERNAME` is set
- `WEBDAV_PASSWORD` is set
- `SESSION_SECRET` is set

### Login works but assets look stale

Refresh once or twice after updates so the latest PWA assets take over.

### A book never appears in the library

Check:

- the in-app conversion log viewer
- the `failed/` folder

### OPDS links point at the wrong address

Your `BASE_URL` is wrong or missing.
