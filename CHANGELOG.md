# Changelog

## 1.0.6 - 2026-04-21

### Added

- integrated the published `dyslibria-converter@0.2.0` npm package into the self-hosted app so Docker, the hosted worker path, and local tooling now share the same EPUB conversion engine
- package-backed EPUB inspection during upload so invalid or malformed books are rejected earlier
- structured conversion step logging from the shared package into Dyslibria's existing in-app conversion logs
- loading skeletons and cached shelf rendering for faster-feeling library open and return-to-library flows
- incremental card rendering and cached cover delivery for smoother large-library performance on slower hardware
- fullscreen PWA display mode so installed Dyslibria feels more native on supported devices

### Changed

- pinned the conversion engine dependency to an exact package version for reproducible Docker and local installs
- kept failed conversions quarantined while cleaning up partial processed outputs more reliably
- updated the install and release docs to reflect the published package-backed pipeline and current image tag example

### Notes

- no storage path migration is required for this release
- Docker persistence paths remain `/usr/src/app/uploads`, `/usr/src/app/processed`, `/usr/src/app/db`, and `/usr/src/app/failed`
