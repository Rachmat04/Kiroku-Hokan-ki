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
