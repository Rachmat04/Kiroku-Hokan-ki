# Kiroku Hokan-ki (Archive Assistant)

## Overview

**Kiroku Hokan-ki** is a gadget that automates the archiving of talk page discussions based on year. It helps maintain structured discussion pages by moving older threads into year-based archive subpages.

## Features

* Adds archive buttons to level-2 headings on talk pages
* Provides a bulk management panel for handling multiple threads
* Detects and filters discussion threads automatically
* Moves selected threads into year-based archive subpages
* Cleans up the source page after archiving

## Scope

* Works only within talk page namespaces
* Uses a year-based archive structure (for example: `/2024`, `/2025`)

## Limitations

* Only supports talk pages
* Requires write API access to modify page content
* Does not support non-talk namespaces
* Not designed for archive structures that are not based on years

## Access Control

* Restricted to a single account: `Rachmat04`
* Access is enforced within the script

## Requirements

* JavaScript-enabled gadget environment
* Permission to edit pages via the API
* Access to talk page namespaces

## How It Works

1. Detects level-2 headings on talk pages
2. Injects archive buttons beside headings
3. Allows selection of threads for archiving
4. Groups threads by year
5. Moves content to the relevant archive subpages
6. Removes archived threads from the original page

## Notes

* Intended for structured archival workflows
* Built around year-based organisation
* Changes are applied directly to pages via the API
