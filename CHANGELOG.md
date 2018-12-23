# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Fixed
- Fix select events not getting thrown for first and last items
- Fix select events not getting thrown because of float errors
- Stop dispatching select events when there is an active external force on the scroll

## [0.0.1-alpha.1] - 2018-12-22
### Changed
- Uses css-transform to animate the scroll instead of scrollTop

## [0.0.1-alpha.0] - 2018-12-19
### Added
- Minimal scrolltop based scrolling on wheel, touch and keyboard events
- Physics for snapping items to their location