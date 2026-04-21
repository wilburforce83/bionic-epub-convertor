# Release Guide

## Overview

Dyslibria is set up to publish Docker images to Docker Hub through GitHub Actions.

The published image name is:

- `wilburforce83/dyslibria`

The workflow lives at:

- `.github/workflows/docker-publish.yml`

It builds and pushes:

- `latest`
- semver aliases derived from the pushed git tag, such as `1.0.0` and `1.0`

It publishes multi-arch images for:

- `linux/amd64`
- `linux/arm64`

## One-Time Setup

### 1. Create the Docker Hub repository

Create this repository in Docker Hub if it does not already exist:

- `wilburforce83/dyslibria`

### 2. Add GitHub repository secrets

In the GitHub repository settings, add:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Recommended values:

- `DOCKERHUB_USERNAME=wilburforce83`
- `DOCKERHUB_TOKEN=<Docker Hub access token with write access>`

Use a Docker Hub access token, not your normal password.

### 3. Confirm the workflow file is present

The repo should contain:

- `.github/workflows/docker-publish.yml`

That workflow publishes on:

- git tag pushes matching `v*`
- manual `workflow_dispatch`

## Normal Release Flow

### 1. Make sure the release commit is ready

Run the usual checks locally:

```bash
npm test
```

If you have Docker available locally, it is also worth doing a final image smoke test:

```bash
docker build -t dyslibria-release-test .
docker run --rm -p 3000:3000 -p 1900:1900 dyslibria-release-test
```

### 2. Commit and push your final changes

Example:

```bash
git add .
git commit -m "Prepare release v1.0.6"
git push origin main
```

### 3. Create and push a version tag

Example:

```bash
git tag v1.0.6
git push origin v1.0.6
```

Pushing that tag triggers the Docker publish workflow automatically.

### 4. Verify the GitHub Actions run

In GitHub Actions, check `Publish Docker Image` and confirm it succeeded.

### 5. Verify the Docker image

After the workflow finishes, confirm these image tags exist in Docker Hub:

- `wilburforce83/dyslibria:latest`
- `wilburforce83/dyslibria:1.0.6`
- `wilburforce83/dyslibria:1.0`

## Manual Publish Trigger

If you need to republish without creating a new tag:

1. Open the repository in GitHub
2. Go to `Actions`
3. Open `Publish Docker Image`
4. Click `Run workflow`

That will publish `latest` from the selected revision.

## End-User Docker Path

End users should not need to build the image themselves.

They can:

1. clone the repo for the compose file and docs
2. run:

```bash
docker compose pull
docker compose up -d
```

If they want to stay on a specific release, they can export or define:

```env
IMAGE_TAG=1.0.6
```

## Release Checklist

- `README.md` reflects the current Docker install path
- `docs/INSTALL.md` matches the published image workflow
- `docs/USAGE.md` matches the current UI
- `package.json` pins the intended `dyslibria-converter` package version
- `.env.example` contains the required settings
- `docker-compose.yml` points at `wilburforce83/dyslibria:latest`
- `.github/workflows/docker-publish.yml` is present
- GitHub secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are configured
- the release tag has been pushed
- the published image is visible in Docker Hub

## Notes

- This repository still supports local source installs for development.
- The Docker publish workflow is the cleanest release path because it does not depend on a local machine having the right Docker setup.
