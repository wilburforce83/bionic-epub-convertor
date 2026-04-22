# Changelog

## 1.0.15 - 2026-04-22

### Changed

- upgraded the shared `dyslibria-converter` dependency to `0.3.0`
- enabled the converter's default EPUB image optimization profile for all uploaded books so self-hosted processing now uses the same aggressive-safe size reduction path by default

## 1.0.7 - 2026-04-21

### Added

- an in-modal upload progress bar for library batch uploads, including live byte progress, queue confirmation, and clear failure messaging during large multi-book uploads
- a new reader page margin slider so readers can move the text block further in from the edge of the screen and tune the page feel more like a dedicated ereader

### Changed

- kept the upload modal open and informative while files are still transferring or being validated by the server
- tuned the reader padding logic so the new page margin setting stays comfortable across phone and larger-screen layouts

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
