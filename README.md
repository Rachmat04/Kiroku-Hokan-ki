# Kiroku Hokan-ki (Archive Assistant)

## Overview

Kiroku Hokan-ki is a gadget that automates archiving of talk page discussions based on year. It is designed for structured maintenance of discussion pages by moving older threads into year-based archive subpages.

## Features

* Adds archive buttons to level-2 headings on talk pages
* Bulk management panel for thread handling
* Detects and filters discussion threads
* Moves selected threads into year-based archive subpages
* Cleans up the source talk page after archiving
* Works through an interface for managing multiple threads at once

## Scope

* Operates only on talk page namespaces
* Uses year-based archiving structure (e.g., `/2024`, `/2025`)

## Limitations

* Only works on talk pages
* Requires write API access to modify pages
* Does not support non-talk namespaces
* Not designed for non-year-based archive structures

## Access Control

* Restricted to a single account: `Rachmat04`
* Access is enforced directly in the script
* Other accounts are blocked from executing actions

## Requirements

* JavaScript-enabled environment (gadget user script context)
* Permission to edit pages via API
* Access to talk page namespaces

## How It Works

1. Detects level-2 headings on talk pages
2. Injects archive action buttons next to headings
3. Allows selection of threads for archiving
4. Groups threads by year
5. Moves content to corresponding archive subpages
6. Removes archived threads from the original page

## Notes

* Intended for structured archival workflows
* Behavior is tightly coupled to year-based organization
* Editing actions are irreversible without manual recovery from archives
