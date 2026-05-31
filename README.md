# Kiroku Hōkan-ki — 記録保管機  

**Type:** Semi-automated talk page archiving gadget  
**Language:** JavaScript (User script)

---

## Overview

**Kiroku Hōkan-ki** is a MediaWiki gadget designed to help maintain talk pages. It moves inactive discussion threads into archive subpages automatically.

It is intended for user talk pages and project talk pages where long-running discussions need regular cleanup.

---

## Purpose

This tool helps with:

- Keeping talk pages readable
- Reducing page length over time
- Organising older discussions into archives
- Preserving discussion history in a structured way

---

## Key features

- Splits talk pages into threads using level-2 headings (`== Heading ==`)
- Detects user signatures and timestamps across many wiki languages (400+ formats)
- Shows relative time labels (for example: `~2 weeks ago`)
- Supports batch archiving of multiple threads
- Includes safeguards against edit conflicts and outdated basetimestamps
- Provides a gadget portlet entry available across pages (with context warning when not on talk pages)

---

## How it works

1. The gadget scans the current page for level-2 headings.
2. Each section is treated as a separate discussion thread.
3. It detects the latest timestamp in each thread.
4. Threads older than the configured threshold are selected for archiving.
5. Selected threads are moved into an archive subpage.
6. The original page is updated with a safe edit check.

---

## Changelogs

### v2.5.2

#### Changed

* Refined dialog and toolbar button styles to fully align with the Tengu UI design system.
* Adopted the `tng-btn` base class and standardised button variants (`tng-btn-primary`, `tng-btn-quiet`, and `tng-btn-destructive`) for visual and naming consistency.
* Introduced the `tng-btn-inline` variant for compact inline actions.

### v2.5.1

#### Changed

* Updated dialog and toolbar buttons to use the Tengu UI design system.
* Replaced MediaWiki `mw-ui-button` classes with Kiroku Hōkan-ki's self-contained `ta-btn-primary` and `ta-btn-quiet` styles for improved visual consistency.

### v2.5.0

#### Changed

* Replaced MediaWiki `mw-ui-button` dialog controls with a self-contained Tengu-style button system (`ta-btn-primary`, `ta-btn-quiet`, and `ta-btn-destructive`).
* Button appearance is now independent of the local wiki stylesheet and remains consistent across all dialog footers and the scan toolbar.

### v2.4.0

#### Added

* Added the `classifyApiError()` utility to map common MediaWiki API error codes (such as `blocked`, `protectedpage`, `readonly`, and `editconflict`) to clear, human-readable messages displayed in both dialogs and the browser console.

#### Changed

* Batch and single-archive error handlers now display specific failure reasons in the progress log instead of generic fallback messages.
* Console error messages now include the classified API error code to improve filtering and troubleshooting.

### v2.3.0

#### Added

* The gadget portlet is now available on all pages, with a notice displayed when used outside supported contexts.

#### Changed

* Standardised all interface text and comments using sentence case and en-GB spelling.

### v2.2.0

#### Changed

* Allowed table header text to wrap onto multiple lines, improving readability on smaller screens.
* Updated the minor version number to reflect interface improvements.

### v2.1.2

#### Added

* Visual override indicator for manually selected archive years in the single-thread archive dialog.

#### Changed

* Reduced the height of the single-thread archive dialog to improve screen space utilisation.

---

## Access restriction notice

This gadget is restricted for use by specific authorised users only.

- If you are not an authorised user, you are not intended to use this tool.
- Other users must modify the source code before using it in their own environment.
- No support is provided for unauthorised or modified deployments.

---

## Safety notes

- The gadget checks for edit conflicts before saving.
- If the page has changed during processing, the operation will stop.
- Users should review selected threads before confirming archiving.

---

## Notes

- Timestamp parsing supports multiple languages and formats.
- Relative time display is approximate and may vary depending on local wiki configuration.
- Performance depends on page size and number of threads.

---

## Disclaimer

This gadget modifies page content on save.

Use with care on shared or high-traffic talk pages. Always verify changes before confirming.

---

## License

This project is licensed under the MIT License.

You are free to use, copy, modify, and distribute this software under the terms of the MIT License, provided that the original copyright notice and permission notice are included in all copies or substantial portions of the software.
