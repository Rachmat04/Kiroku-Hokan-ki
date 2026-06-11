## v2.11.0

### Changed
- Increased the width of `.ta-dialog-sm` from **520px** to **720px** (while retaining the existing responsive width limit)
- Changed `.ta-dialog-sm` height behaviour from a fixed **290px** to an automatic content-based height
- Increased the maximum dialog height from **82vh** to **85vh**.
- Removed the dedicated scroll area from `.ta-confirm-list`
- Removed the `max-height` constraint from `.ta-confirm-list`
- Removed `overflow-y: auto` from `.ta-confirm-list`, allowing scrolling to be handled by the parent dialog body

### Fixed
- Fixed usability issues caused by the confirmation dialog being too small for larger archive operations
- Fixed nested scrolling behaviour within the confirmation dialog
- Fixed situations where users had to manage multiple scrollbars to review archive targets

### Removed
- Removed the internal scrollbar previously used by `.ta-confirm-list`

### Improved
- Improved readability by providing a wider confirmation dialog
- Improved responsiveness by allowing dialog height to adapt to content
- Improved user experience by consolidating scrolling into a single container
- Improved visibility of archive targets and confirmation details
- Improved behaviour across different screen sizes while maintaining viewport constraints
- Reduced excessive scrolling when reviewing archive candidates

### Notes
- Scrolling is now handled exclusively by `.ta-dialog-body`, which already provides `overflow-y: auto`
- The dialog remains constrained by `max-height: 85vh` and will not exceed the available viewport height
- Very large confirmation lists may cause the dialog body to contain significantly more content before scrolling begins
- This release affects only dialog layout and scrolling behaviour; no archive-processing logic was changed

## v2.10.0

### Added

* Added the `CHRONOLOGICAL_ALIGNMENT` configuration flag to control chronological alignment functionality globally
* Added `applyChronologicalAlignment()`, a dedicated function for aligning thread dates based on chronological context
* Added an alignment toggle to the bulk archive panel toolbar when the feature is enabled
* Added an `aligned` state indicator to distinguish automatically aligned dates from original dates
* Added enhanced tooltips for aligned dates explaining how the displayed date was determined

### Changed

* Updated `buildDateDisplayHtml()` to accept an `aligned` parameter and render aligned dates with distinct visual styling
* Updated table row rendering to pass alignment state information to the date display renderer
* Updated bulk archive panel behaviour to support enabling and disabling chronological alignment at runtime
* Updated rescan handling so chronological alignment is automatically re-applied after newly loaded items are processed

### Fixed

* Improved date consistency across thread collections by aligning eligible timestamps according to surrounding chronological context
* Preserved manual year overrides when applying chronological alignment
* Ensured entries with null timestamps are excluded from alignment processing

### Improved

* Improved date accuracy and ordering for archive preparation workflows
* Improved maintainability by isolating chronological alignment logic within a dedicated, testable function
* Improved transparency by visually distinguishing aligned dates from unmodified dates
* Improved usability by allowing the feature to be enabled or disabled directly from the interface without modifying configuration code
* Improved consistency by automatically re-applying alignment after rescans

### Notes

* The feature can be completely disabled through the `CHRONOLOGICAL_ALIGNMENT` configuration flag
* When disabled, the alignment controls are not displayed in the interface
* `applyChronologicalAlignment()` operates directly on the parsed state collection and updates eligible items in place
* Aligned dates use distinct styling and tooltips to differentiate them from original timestamps

## 2.9.1

### Changed

* Updated various interface strings, labels, tooltips, dialog titles, button labels, comments, and attribution text for improved wording and consistency

### Fixed

* Fixed year-selection behaviour when timestamps have not yet been loaded
* Updated the year override logic so the reference-year comparison only runs when `tsLoaded` is `true`
* Ensured `yearOverride` is set unconditionally when timestamp data is unavailable, preventing incorrect year handling during initialisation

### Improved

* Refined user-facing text across archive panels, notices, confirmations, portlet links, and action buttons
* Improved wording consistency throughout the interface while preserving existing functionality
* Left repository paths and internal JavaScript identifiers unchanged to maintain compatibility with existing technical references

## 2.9.0

### Changed

* Added `ArchiveConfig.PRECISE_SUB_DAY_TIMES` option (default: `true`)

### Improved

* Enhanced `getRelativeTimeAgo` "today" handling to support hour/minute granularity when `PRECISE_SUB_DAY_TIMES` is enabled
* Improved time display accuracy for same-day timestamps while preserving existing relative time behaviour for older entries
* Kept default behaviour enabled without requiring configuration changes

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
