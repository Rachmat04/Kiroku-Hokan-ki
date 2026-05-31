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

[View changelogs](./CHANGELOG.md)

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
