## 2.8.1

### Added
- Added a `cjk-signature` timestamp pattern to `WikitextParser.computeThreadActivityDate()` for detecting signatures in the `YYYY年MM月DD日 (W) HH:MM` format

## 2.8.0

### Changed
- Replaced `indexOf()` lookups in `LocalisationEngine` with a pre-built `Map` for O(1) key resolution
- Refactored modal stack handling to store close functions instead of overlay elements
- Renamed methods for clarity:
  - `renderOptimisedTableRows()` → `renderTableRows()`
  - `optimiseFooterCounters()` → `updateFooterCounters()`
- Replaced button variant `if/else` chain with a lookup map

### Fixed
- Eliminated a race condition when archiving by replacing fetch–merge–write logic with a single atomic `appendtext` API call

### Improved
- Extracted `WikitextParser.buildDateDisplayHtml()` as the single source of truth for tooltip-enabled date rendering
- Extracted `WikitextParser.buildYearOptionHtml()` and reduced repeated year option generation
- Simplified dialog footer creation by returning `footerRight` directly and removing duplicated setup code
- Centralised edit summary attribution via `ArchiveConfig.EDIT_SUMMARY_ATTRIBUTION`
- Added `ArchiveConfig.YEAR_RANGE` to replace duplicated constants
- Consolidated notice rendering through a shared `_showInfoNotice()` helper
- Reduced duplicated logic and improved maintainability across archive workflows

### Added
- `ArchiveConfig.YEAR_RANGE` configuration constant
- `ArchiveConfig.EDIT_SUMMARY_ATTRIBUTION` shared attribution constant

## 2.7.1

### Changed
- Version bump to 2.7.1 for UI refinements
- Reduced `.ta-col-ts` (Last active) column width from 200px to 110px
- Adjusted `.tng-btn-inline` sizing:
  - font-size: 0.8em → 0.72em
  - padding: 1px 4px → 0 4px
  - margin-left: 8px → 6px

### Fixed
- Normalised "e-mail" to "email" in the error parser

### Improved
- Standardised interface text, labels, and comments to sentence case and en-GB spelling
- Improved layout spacing in discussion table UI

## v2.7.0

### Added

* Added hover tooltips for relative timestamps in both table and single-archive views.
* Added visual affordance for interactive dates using `cursor: help` and a dotted underline indicator.

### Changed

* Updated `renderOptimisedTableRows()` to separate ISO date display (visible text) from relative time (tooltip content).
* Updated `openSingleArchivePanel()` to move relative time strings into the `title` attribute of the rendered date element.
* Improved date display consistency across table and single-thread archive interfaces.

### Improved

* Enhanced discoverability of relative timestamps by making hover behaviour visually explicit.
* Verified existing interface text for consistent en-GB spelling and sentence case; no additional linguistic changes required.

## v2.6.0

### Added

* Added state caching for the original page revision and wikitext buffer during initialisation, ensuring archive operations are performed against the exact content that was originally loaded.

### Fixed

* Fixed a Time-of-Check to Time-of-Use (TOCTOU) issue that could occur if a talk page was modified while the archive dialog remained open.
* Archive operations now rely on the original revision state, allowing the MediaWiki API to correctly detect and reject conflicting edits through standard edit conflict protection.
* Hardened discussion header parsing to ignore empty or whitespace-only section headers, preventing unrelated discussions from being merged incorrectly.

### Improved

* Improved overall archive reliability by preventing string index calculations from being applied to changed page content.
* Reviewed interface labels, table headers, buttons, messages, and comments for consistent sentence case.
* Standardised en-GB spelling throughout the gadget, including terms such as "initialise", "optimise", and "authorised".

## v2.5.4

### Fixed

* Improved date parsing to correctly recognise month names containing spaces and abbreviated month names with trailing full stops.
* Fixed chronological sorting by correctly parsing timestamps that appear after date signatures.
* Corrected wikilink stripping behaviour to prevent complex file descriptor links from being parsed incorrectly.
* Replaced escaped line break sequences with actual line breaks in archive output and batch execution messages, preventing formatting issues on wiki pages.
* Replaced manual page title reconstruction with MediaWiki's native namespace and title handling for improved reliability.

### Improved

* Enhanced month name sanitisation before matching against localisation maps, improving compatibility with a wider range of signature formats.
* Improved compatibility with multilingual and localised date formats.
* Reviewed interface text and comments to ensure consistent sentence case and en-GB spelling throughout the gadget.

## v2.5.3

### Fixed

* Improved the display of threads without detected timestamp signatures in scan results.
* Replaced the plain "Not found" status with a styled "No signature found" indicator for consistency with the single-thread archive dialog.
* Added a tooltip explaining that no timestamp signature was detected in the thread.
* Applied the same muted visual styling used by the pre-scan "Not scanned" state to improve interface consistency.

## v2.5.2

### Changed

* Refined dialog and toolbar button styles to fully align with the Tengu UI design system.
* Adopted the `tng-btn` base class and standardised button variants (`tng-btn-primary`, `tng-btn-quiet`, and `tng-btn-destructive`) for visual and naming consistency.
* Introduced the `tng-btn-inline` variant for compact inline actions.

## v2.5.1

### Changed

* Updated dialog and toolbar buttons to use the Tengu UI design system.
* Replaced MediaWiki `mw-ui-button` classes with Kiroku Hōkan-ki's self-contained `ta-btn-primary` and `ta-btn-quiet` styles for improved visual consistency.

## v2.5.0

### Changed

* Replaced MediaWiki `mw-ui-button` dialog controls with a self-contained Tengu-style button system (`ta-btn-primary`, `ta-btn-quiet`, and `ta-btn-destructive`).
* Button appearance is now independent of the local wiki stylesheet and remains consistent across all dialog footers and the scan toolbar.

## v2.4.0

### Added

* Added the `classifyApiError()` utility to map common MediaWiki API error codes (such as `blocked`, `protectedpage`, `readonly`, and `editconflict`) to clear, human-readable messages displayed in both dialogs and the browser console.

### Changed

* Batch and single-archive error handlers now display specific failure reasons in the progress log instead of generic fallback messages.
* Console error messages now include the classified API error code to improve filtering and troubleshooting.

## v2.3.0

### Added

* The gadget portlet is now available on all pages, with a notice displayed when used outside supported contexts.

### Changed

* Standardised all interface text and comments using sentence case and en-GB spelling.

## v2.2.0

### Changed

* Allowed table header text to wrap onto multiple lines, improving readability on smaller screens.
* Updated the minor version number to reflect interface improvements.

## v2.1.2

### Added

* Visual override indicator for manually selected archive years in the single-thread archive dialog.

### Changed

* Reduced the height of the single-thread archive dialog to improve screen space utilisation.
