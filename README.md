# Dyslibria

Dyslibria is a self-hosted EPUB conversion, library, and browser reading app built around a bionic-style reading transform. Upload EPUB files, convert them into Dyslibria format, read them in the web UI, or access the processed library over OPDS and WebDAV.

## What It Does

- Converts uploaded EPUB files into Dyslibria's bionic-style reading format
- Stores a processed library for browser reading, OPDS clients, and WebDAV access
- Includes a responsive reader for desktop, tablet, mobile, and installed PWA use
- Saves reading progress on the server so books reopen at the last location
- Quarantines failed conversions instead of silently publishing broken books

## Quick Start

The recommended path is Docker.

```bash
git clone https://github.com/wilburforce83/bionic-epub-convertor.git
cd bionic-epub-convertor
cp .env.example .env
mkdir -p uploads processed db failed
docker compose up -d
```

The included Compose file pulls the published image:

- `wilburforce83/dyslibria:latest`

If you want to pin a specific release instead of tracking `latest`, set `IMAGE_TAG` in `.env`.

Then open:

- Web app: `http://localhost:3000`
- WebDAV: `http://localhost:1900`
- OPDS: `http://localhost:3000/opds`

## Documentation

- [Installation Guide](docs/INSTALL.md)
- [Usage Guide](docs/USAGE.md)
- [Maintainer Release Guide](docs/RELEASE.md)

## Main Data Folders

- `uploads/`: staged incoming EPUB files
- `processed/`: the live processed library
- `db/`: settings, metadata cache, and reading-progress data
- `failed/`: quarantined files that failed validation or conversion
- `temp/`: temporary processing files only, not intended for persistence

## Health Check

The app exposes:

- `GET /healthz`

This returns basic service state including queue length, processing state, and metadata readiness.

## Local Development

If you want to run it directly with Node instead of Docker, see the source install section in [docs/INSTALL.md](docs/INSTALL.md).

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md).
