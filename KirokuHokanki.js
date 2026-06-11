/**
 * ============================================================================
 * Kiroku Hōkan-ki — 記録保管機
 * Version 2.12.0
 * Semi-automated talk page archiving gadget
 * ============================================================================
 * PURPOSE:
 * An automated talk page archiving gadget for MediaWiki that streamlines user
 * talk page maintenance by moving inactive discussions into subpages.
 *
 * REPOSITORY:
 * https://github.com/Rachmat04/Kiroku-Hokan-ki
 * ============================================================================
 */
// <nowiki>

(function () {
  "use strict";

  // ============================================================================
  // [Module 01] Global app configuration
  // ============================================================================
  class ArchiveConfig {
    static get ALLOWED_USER() {
      return "Rachmat04";
    }

    static get TARGET_NAMESPACE() {
      return 3; // User talk namespace
    }

    /** Attribution string appended to every edit summary. */
    static get EDIT_SUMMARY_ATTRIBUTION() {
      return `— [[w:id:Pengguna:${ArchiveConfig.ALLOWED_USER}/KirokuHokanki.js|📜]]`;
    }

    /**
     * Number of years below the current year offered in archive year dropdowns.
     * The upper bound is always current year + 1.
     */
    static get YEAR_RANGE() {
      return 15;
    }

    /**
     * Dynamically detects the active wiki language environments at runtime.
     * Scales across all 400+ languages natively without bloating performance.
     */
    static get TARGET_LANGUAGES() {
      const activeContexts = new Set([
        "en",
        mw.config.get("wgContentLanguage"),
        mw.config.get("wgUserLanguage"),
      ]);
      return Array.from(activeContexts).filter(Boolean);
    }

    /**
     * When true, relative timestamps shorter than 24 hours are shown as
     * "~N hours ago" or "~N mins ago" instead of the vague "today".
     * Set to false to revert to the previous "today" label.
     */
    static get PRECISE_SUB_DAY_TIMES() {
      return true;
    }

    /**
     * When true, chronological-order alignment is available in the bulk
     * archive panel. The feature ensures no thread is assigned an older
     * timestamp than the thread immediately above it in document order,
     * preserving a coherent archive structure.
     * Set to false to hide the alignment option entirely.
     */
    static get CHRONOLOGICAL_ALIGNMENT() {
      return true;
    }

    /**
     * Computes the regional archive subpage string prefix.
     */
    static getArchiveSubpagePrefix() {
      const subdomain = window.location.hostname.split(".")[0];
      const ARSIP_WIKIS = new Set([
        "id",
        "ace",
        "ban",
        "bjn",
        "map-bms",
        "bbc",
        "bbc-latn",
        "bbj",
        "bew",
        "bug",
        "gor",
        "jv",
        "kge",
        "mad",
        "btm",
        "min",
        "nia",
        "su",
      ]);
      return ARSIP_WIKIS.has(subdomain) ? "Arsip" : "Archives";
    }
  }

  const mwConfig = mw.config.get();

  // Environment execution context check
  const isAllowedUser = mwConfig.wgUserName === ArchiveConfig.ALLOWED_USER;
  const isTargetNamespace =
    mwConfig.wgNamespaceNumber === ArchiveConfig.TARGET_NAMESPACE;
  const isTargetPage = mwConfig.wgTitle === ArchiveConfig.ALLOWED_USER;
  const isValidAction =
    mwConfig.wgAction === "view" &&
    !mwConfig.wgDiffNewId &&
    !mwConfig.wgDiffOldId &&
    mwConfig.wgCurRevisionId === mwConfig.wgRevisionId;

  const IS_ALLOWED_CONTEXT =
    isAllowedUser && isTargetNamespace && isTargetPage && isValidAction;

  // ============================================================================
  // [Utility] API error classifier
  // ============================================================================
  /**
   * Classifies a caught MediaWiki API error into a structured result containing
   * a short code and a human-readable message suitable for display in a dialogue
   * box or the browser console.
   */
  function classifyApiError(err) {
    const KNOWN_ERRORS = {
      blocked: "Your IP address or account has been blocked from editing.",
      autoblocked:
        "Your IP address has been automatically blocked because it was recently used by a blocked user.",
      ipblocked: "Your IP address is blocked from editing.",
      protectedpage: "This page is protected and cannot be edited.",
      cascadeprotected:
        "This page is protected via cascade protection and cannot be edited.",
      readonly: "The wiki is currently in read-only mode.",
      badtoken:
        "The CSRF token was invalid. Try reloading the page and archiving again.",
      permissiondenied: "You do not have permission to edit this page.",
      editconflict:
        "An edit conflict occurred. Please reload the page and try again.",
      ratelimited:
        "You have been rate-limited. Please wait a moment before trying again.",
      "abusefilter-disallowed": "The edit was blocked by an abuse filter rule.",
      "abusefilter-warning":
        "An abuse filter warning was triggered. The edit was not saved.",
      confirmemail: "You must confirm your email address before editing.",
      blocked_range: "Your IP address range has been blocked from editing.",
    };

    if (typeof err === "string") {
      const message =
        KNOWN_ERRORS[err] ||
        `The server returned an error: "${err}". Check the browser console for details.`;
      return { code: err, message };
    }

    if (err instanceof Error) {
      return {
        code: "exception",
        message:
          err.message ||
          "An unexpected error occurred. Check the browser console for details.",
      };
    }

    return {
      code: "unknown",
      message:
        "An unexpected error occurred. Check the browser console for details.",
    };
  }

  // ============================================================================
  // [Module 02] MediaWiki API service layer
  // ============================================================================
  class WikiApiService {
    constructor() {
      this.api = new mw.Api();
      this.pageName = mwConfig.wgPageName;
    }

    async getPageSourceData() {
      const response = await this.api.get({
        action: "query",
        prop: "revisions",
        rvprop: ["content", "timestamp"],
        titles: this.pageName,
        formatversion: 2,
      });
      const page = response.query.pages[0];
      return {
        text: page.revisions?.[0]?.content || "",
        baseTimestamp: page.revisions?.[0]?.timestamp || "",
      };
    }

    async fetchSystemMessages(targetLanguage, messages) {
      const response = await this.api.get({
        action: "query",
        meta: "allmessages",
        ammessages: messages.join("|"),
        amlang: targetLanguage,
        formatversion: 2,
      });
      return response.query?.allmessages || [];
    }

    /**
     * Appends threadsWikitext to the archive subpage.
     *
     * Previously this method read the archive page first, then wrote the full
     * merged text back — a read-modify-write pattern with a race condition.
     * Using appendtext removes the fetch entirely: the MediaWiki API appends
     * atomically and creates the page automatically if it does not yet exist.
     */
    async saveToArchiveTarget(archiveTitle, threadsWikitext, summary) {
      return this.api.postWithToken("csrf", {
        action: "edit",
        title: archiveTitle,
        appendtext: `\n\n${threadsWikitext.trim()}\n`,
        summary,
      });
    }

    async updateTalkSourcePage(dynamicContent, summary, baseTimestamp) {
      return this.api.postWithToken("csrf", {
        action: "edit",
        title: this.pageName,
        text: dynamicContent,
        summary,
        basetimestamp: baseTimestamp,
      });
    }
  }

  // ============================================================================
  // [Module 03] Dynamic localisation engine
  // ============================================================================
  class LocalisationEngine {
    constructor(apiService) {
      this.apiService = apiService;
      this.monthMap = {};
    }

    async initialiseSubsystem() {
      const primaryMessageKeys = [
        "january",
        "february",
        "march",
        "april",
        "may_long",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "january-gen",
        "february-gen",
        "march-gen",
        "april-gen",
        "may-gen",
        "june-gen",
        "july-gen",
        "august-gen",
        "september-gen",
        "october-gen",
        "november-gen",
        "december-gen",
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ];

      // Pre-build a Map for O(1) key-to-index lookups, avoiding an O(n) indexOf
      // call inside the forEach loop for every message across every language.
      const keyIndexMap = new Map(primaryMessageKeys.map((k, i) => [k, i]));

      const fetchingPromises = ArchiveConfig.TARGET_LANGUAGES.map(
        async (langCode) => {
          try {
            const messages = await this.apiService.fetchSystemMessages(
              langCode,
              primaryMessageKeys,
            );
            messages.forEach((msg) => {
              if (!msg.content || msg.missing) return;
              const keyIndex = keyIndexMap.get(msg.name);
              if (keyIndex === undefined) return;
              const cleanTerm = msg.content.toLowerCase().trim();
              this.monthMap[cleanTerm] = (keyIndex % 12) + 1;
            });
          } catch (err) {
            console.warn(
              `[KirokuHokanki] Localisation failed for language code [${langCode}]:`,
              err,
            );
          }
        },
      );

      await Promise.all(fetchingPromises);
      this.injectLocalSystemOverrides();
    }

    injectLocalSystemOverrides() {
      const regionalOverrides = {
        "buleuen sa": 1,
        "buleuen duwa": 2,
        "buleuen lhèe": 3,
        "buleuen peuet": 4,
        "buleuen limöng": 5,
        "buleuen nam": 6,
        "buleuen tujôh": 7,
        "buleuen lapan": 8,
        "buleuen sikureueng": 9,
        "buleuen siplôh": 10,
        "buleuen siblaih": 11,
        "buleuen duwa blah": 12,
      };
      Object.assign(this.monthMap, regionalOverrides);
    }

    getMonthMap() {
      return this.monthMap;
    }
  }

  // ============================================================================
  // [Module 04] Wikitext component parser
  // ============================================================================
  class WikitextParser {
    static stripWikilinks(headingTitle) {
      let cleared = headingTitle.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
      cleared = cleared.replace(/\[\[([^\]]+)\]\]/g, (_match, target) => {
        const elements = target.split(/[:/]/);
        return elements[elements.length - 1].trim();
      });
      return cleared.replace(/<[^>]+>/g, "").trim();
    }

    static dissectThreads(rawWikitext) {
      // Prevents matching empty sections like "== ==" or "==  =="
      const regexMatcher = /^==\s*([^=\n]*?[^\s=][^=\n]*?)\s*==\s*$/gm;
      const entryPoints = [];
      let segment;

      while ((segment = regexMatcher.exec(rawWikitext)) !== null) {
        entryPoints.push({ title: segment[1].trim(), start: segment.index });
      }
      entryPoints.push({ title: null, start: rawWikitext.length });

      return entryPoints.slice(0, -1).map((point, index) => ({
        title: point.title,
        titleClean: WikitextParser.stripWikilinks(point.title),
        content: rawWikitext.substring(
          point.start,
          entryPoints[index + 1].start,
        ),
        start: point.start,
        end: entryPoints[index + 1].start,
      }));
    }

    static normaliseNumerals(inputStr) {
      return inputStr.replace(
        /[\u0660-\u0669\u06F0-\u06F9\u09E6-\u09EF]/g,
        (digitChar) => {
          const pointCode = digitChar.charCodeAt(0);
          if (pointCode >= 0x0660 && pointCode <= 0x0669)
            return pointCode - 0x0660;
          if (pointCode >= 0x06f0 && pointCode <= 0x06f9)
            return pointCode - 0x06f0;
          if (pointCode >= 0x09e6 && pointCode <= 0x09ef)
            return pointCode - 0x09e6;
          return digitChar;
        },
      );
    }

    /**
     * Scans a thread content block line by line to find the most recent
     * timestamp signature. Processing line by line reduces cross-line false
     * positives and confines each pattern match to a single logical unit of
     * wikitext (one signature per line).
     *
     * For each line the method attempts every pattern in priority order and
     * advances to the next line as soon as one match is found, avoiding
     * redundant work on lines that have already yielded a date.
     *
     * @param   {string}  contentBlock  Raw wikitext of a single thread section.
     * @param   {Object}  monthMap      Localised month-name → month-number map.
     * @returns {Date|null}             Most recent UTC date found, or null.
     */
    static computeThreadActivityDate(contentBlock, monthMap) {
      const translationPatterns = [
        {
          id: "iso-standard",
          re: /\b(\d{4})-(\d{2})-(\d{2})[T\s](\d{2})[.:](\d{2})[.:]?(\d{2})?(?:Z)?\b/g,
          extract: (m) => [+m[1], +m[2], +m[3], +m[4], +m[5]],
        },
        {
          id: "global-dmy-signature",
          re: /(?:(\d{1,2})[.:](\d{2}),\s+)?(\d{1,2})[\s\u200E\u200F\u00A0]+(\p{L}+(?:[\s\u00A0]+\p{L}+)*\.?)[\s\u200E\u200F\u00A0]+(\d{4})(?:[\s,]+(\d{1,2})[.:](\d{2}))?\b/gu,
          extract: (m) => {
            const rawMonth = m[4].toLowerCase().replace(/\./g, "").trim();
            const targetMonth = monthMap[rawMonth];
            if (!targetMonth) return null;
            const hr = +(m[1] || m[6] || 0);
            const mn = +(m[2] || m[7] || 0);
            return [+m[5], targetMonth, +m[3], hr, mn];
          },
        },
        {
          id: "global-mdy-signature",
          re: /\b(\p{L}+(?:[\s\u00A0]+\p{L}+)*\.?)[\s\u200E\u200F\u00A0]+(\d{1,2}),\s+(\d{4})(?:[\s,]+(\d{1,2})[.:](\d{2}))?\b/gu,
          extract: (m) => {
            const rawMonth = m[1].toLowerCase().replace(/\./g, "").trim();
            const targetMonth = monthMap[rawMonth];
            if (!targetMonth) return null;
            const hr = +(m[4] || 0);
            const mn = +(m[5] || 0);
            return [+m[3], targetMonth, +m[2], hr, mn];
          },
        },
        {
          id: "cjk-signature",
          re: /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*\([^)]+\))?\s*(\d{1,2})[:.](\d{2})/gu,
          extract: (m) => [+m[1], +m[2], +m[3], +m[4], +m[5]],
        },
      ];

      // Split into lines and normalise Arabic-Indic/Extended numerals per line.
      // Empty lines and wikitext structural lines (e.g. bare "----") are skipped
      // immediately to avoid unnecessary regex work.
      const lines = contentBlock.split("\n");
      let newestResolvedDate = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line === "----") continue;

        const normalisedLine = WikitextParser.normaliseNumerals(line);
        let lineMatched = false;

        for (const pattern of translationPatterns) {
          // Each pattern regex is used without the global flag so exec() always
          // searches from the start of the string, making it safe to reuse
          // across iterations without resetting lastIndex.
          const compositionMatch = pattern.re.exec(normalisedLine);
          if (!compositionMatch) continue;

          const fields = pattern.extract(compositionMatch);
          if (!fields) continue;

          const [yr, mo, dy, hr, mn] = fields;

          // Retain unified UTC construction. This preserves the string year
          // from the wikitext without local timezone shifts affecting the
          // year folder logic.
          const candidate = new Date(Date.UTC(yr, mo - 1, dy, hr, mn));

          if (!isNaN(candidate.getTime())) {
            if (!newestResolvedDate || candidate > newestResolvedDate) {
              newestResolvedDate = candidate;
            }
            // One match per line is sufficient; move on to the next line.
            lineMatched = true;
            break;
          }
        }

        // Suppress the unused-variable warning in strict environments.
        void lineMatched;
      }

      return newestResolvedDate;
    }

    /** Calculates the approximate human-readable relative time string. */
    static getRelativeTimeAgo(date) {
      if (!date) return "";
      const MS_PER_DAY = 86400000;
      const diffMs = Date.now() - date.getTime();

      // Guard against future timestamps resulting in negative times.
      if (diffMs < 0) return "just now";

      if (diffMs < MS_PER_DAY) {
        // Show precise sub-day time when the option is enabled, so that
        // a timestamp from a few hours ago is not misleadingly labelled "today".
        if (!ArchiveConfig.PRECISE_SUB_DAY_TIMES) return "today";
        const diffHours = Math.floor(diffMs / 3600000);
        if (diffHours < 1) {
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 1) return "just now";
          return `~${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
        }
        return `~${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
      }

      const diffDays = Math.floor(diffMs / MS_PER_DAY);
      if (diffDays < 7)
        return `~${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

      const diffWeeks = Math.floor(diffDays / 7);
      if (diffDays < 30)
        return `~${diffWeeks} week${diffWeeks !== 1 ? "s" : ""} ago`;

      const diffMonths = Math.floor(diffDays / 30.44);
      if (diffDays < 365)
        return `~${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;

      const diffYears = Math.floor(diffDays / 365.25);
      return `~${diffYears} year${diffYears !== 1 ? "s" : ""} ago`;
    }

    /**
     * Builds the HTML for a timestamp table cell, including a relative-time
     * tooltip. Returns a placeholder when the timestamp is unavailable.
     *
     * @param {Date|null} timestamp
     * @param {boolean}   tsLoaded  – false when no scan has been attempted yet
     * @param {boolean}   aligned   – true when the date was clamped by
     *                                chronological-order alignment
     */
    static buildDateDisplayHtml(timestamp, tsLoaded = true, aligned = false) {
      if (!tsLoaded) {
        return `<span style="color:#a2a9b1">Not scanned</span>`;
      }
      if (!timestamp) {
        return `<span style="color:#a2a9b1" title="No timestamp signature was detected in this thread">No signature found</span>`;
      }
      const relStr = WikitextParser.getRelativeTimeAgo(timestamp);
      const isoStr = timestamp.toISOString().slice(0, 10);
      const alignedAttr = aligned
        ? ` title="${mw.html.escape(relStr)} (aligned to preceding thread)" style="cursor:help; border-bottom: 1px dotted #d4730a; color:#7a3a00;"`
        : ` title="${mw.html.escape(relStr)}" style="cursor:help; border-bottom: 1px dotted currentColor;"`;
      return `<span${alignedAttr}>${mw.html.escape(isoStr)}</span>`;
    }

    /**
     * Builds the <option> elements for a year dropdown.
     * Years run from (current + 1) down to (current – YEAR_RANGE).
     */
    static buildYearOptionHtml() {
      const current = new Date().getUTCFullYear();
      let html = "";
      for (let y = current + 1; y >= current - ArchiveConfig.YEAR_RANGE; y--) {
        html += `<option value="${y}">${y}</option>`;
      }
      return html;
    }

    /**
     * Applies chronological-order alignment to an array of internal state
     * items (in document order). If a thread's resolved timestamp is earlier
     * than the timestamp of the preceding thread, it is clamped upward to
     * match that predecessor.
     *
     * Rules:
     * - Only items whose `tsLoaded` flag is true are considered.
     * - Items with a null timestamp are skipped; the last non-null anchor
     *   continues to apply to subsequent items.
     * - The `yearOverride` flag is set on any item whose year changes as a
     *   result of alignment, so the UI can style it accordingly.
     * - The method mutates the items in place and returns the same array.
     *
     * @param   {Array}  stateItems  Array of internal state objects.
     * @returns {Array}              The same array, mutated in place.
     */
    static applyChronologicalAlignment(stateItems) {
      let anchorTimestamp = null;

      for (const item of stateItems) {
        if (!item.tsLoaded || item.timestamp === null) continue;

        if (anchorTimestamp !== null && item.timestamp < anchorTimestamp) {
          // Clamp this item's effective timestamp up to the anchor.
          item.timestamp = new Date(anchorTimestamp.getTime());
          item.aligned = true;
        } else {
          item.aligned = false;
        }

        // Update the year derived from the (possibly clamped) timestamp,
        // unless the user has already made a manual year selection.
        if (!item.yearOverride) {
          item.year = item.timestamp.getUTCFullYear();
        }

        anchorTimestamp = item.timestamp;
      }

      return stateItems;
    }
  }

  // ============================================================================
  // [Module 05] User interface dialogue manager
  // ============================================================================
  class ArchiveUIManager {
    constructor() {
      this.modalStack = [];
      this.registerGlobalEscapes();
      this.injectUtilityStyles();
    }

    registerGlobalEscapes() {
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.modalStack.length > 0) {
          // Modal stack stores close functions, not overlay elements.
          this.modalStack[this.modalStack.length - 1]();
        }
      });
    }

    /**
     * Creates and mounts a modal dialogue.
     *
     * Returns { overlay, body, footer, footerRight, close }.
     * - close()     — call to dismiss the dialogue programmatically.
     * - footerRight — pre-created right-aligned button container inside footer.
     * Callers that also need a left-side footer element should create one and
     * use footer.insertBefore(leftEl, footerRight).
     */
    instantiateDialog(options) {
      const overlay = document.createElement("div");
      overlay.className = "ta-overlay";
      document.body.appendChild(overlay);

      // close() is a plain function, not a property on the DOM node.
      const close = () => {
        overlay.remove();
        this.modalStack = this.modalStack.filter((fn) => fn !== close);
        if (options.onClose) options.onClose();
      };
      this.modalStack.push(close);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });

      const dialogBox = document.createElement("div");
      dialogBox.className =
        "ta-dialog" + (options.small ? " ta-dialog-sm" : "");

      const headerNode = document.createElement("div");
      headerNode.className = "ta-dialog-header";

      const internalTitle = document.createElement("div");
      internalTitle.className = "ta-dialog-header-left";
      internalTitle.textContent = `${options.icon || "📜"} ${options.title}`;

      const dismissButton = document.createElement("button");
      dismissButton.className = "ta-dialog-close";
      dismissButton.textContent = "✕";
      dismissButton.onclick = close;

      headerNode.append(internalTitle, dismissButton);

      const bodyNode = document.createElement("div");
      bodyNode.className = "ta-dialog-body";

      const footerNode = document.createElement("div");
      footerNode.className = "ta-dialog-footer";

      // Pre-create the right-side button container so callers don't have to.
      const footerRight = document.createElement("div");
      footerRight.className = "ta-dialog-footer-right";
      footerNode.appendChild(footerRight);

      dialogBox.append(headerNode, bodyNode, footerNode);
      overlay.appendChild(dialogBox);

      return {
        overlay,
        body: bodyNode,
        footer: footerNode,
        footerRight,
        close,
      };
    }

    /**
     * Creates a styled button, appends it to parent, and returns it.
     * Accepts MediaWiki style class strings as the style parameter.
     */
    static generateButton(label, style, interactionEvent, targetParent) {
      const CLASS_MAP = {
        "mw-ui-progressive": "tng-btn-primary",
        "mw-ui-destructive": "tng-btn-destructive",
        "mw-ui-quiet": "tng-btn-quiet",
      };
      const variantClass =
        Object.entries(CLASS_MAP).find(([k]) => style.includes(k))?.[1] ??
        "tng-btn-quiet";

      const buttonElement = document.createElement("button");
      buttonElement.className = `tng-btn ${variantClass}`;
      buttonElement.textContent = label;
      buttonElement.addEventListener("click", interactionEvent);
      if (targetParent) targetParent.appendChild(buttonElement);
      return buttonElement;
    }

    injectUtilityStyles() {
      mw.util.addCSS(`
                /* --- Tengu-style buttons --- */
                .tng-btn {
                    display: inline-flex; align-items: center; justify-content: center;
                    padding: 5px 14px; border-radius: 4px; font-size: 0.9em;
                    font-weight: 600;
                    cursor: pointer; border: 1px solid transparent;
                    font-family: inherit; transition: background .12s, border-color .12s;
                    white-space: nowrap;
                }
                .tng-btn-primary { background: #3366cc; color: #fff; border-color: #3366cc; }
                .tng-btn-primary:hover:not(:disabled) { background: #2a4b9e; border-color: #2a4b9e; }
                .tng-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
                .tng-btn-quiet { background: none; color: #202122; border-color: #a2a9b1; }
                .tng-btn-quiet:hover:not(:disabled) { background: #f0f2f5; }
                .tng-btn-quiet:disabled { opacity: .5; cursor: not-allowed; }
                .tng-btn-destructive { background: #b00020; color: #fff; border-color: #b00020; }
                .tng-btn-destructive:hover:not(:disabled) { background: #8a0018; border-color: #8a0018; }
                .tng-btn-destructive:disabled { opacity: .5; cursor: not-allowed; }
                
                /* Custom inline button for Kiroku Hōkan-ki */
                .tng-btn-inline {
                    margin-left: 8px;
                    padding: 2px 6px;
                    font-size: 0.85em;
                    line-height: 1.4;
                    border: 1px solid #a2a9b1;
                    border-radius: 4px;
                    background: none;
                    color: inherit;
                    vertical-align: middle;
                }
                .tng-btn-inline:hover:not(:disabled) {
                    background: #eaf0fb;
                    border-color: #36c;
                }

                .ta-btn-spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: ta-spin .6s linear infinite; }
                @keyframes ta-spin { to { transform: rotate(360deg); } }
                .ta-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.52); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 12px; animation: ta-fadein .15s ease-out; }
                .ta-dialog { background: #fff; color: #202122; border: 1px solid #a2a9b1; border-radius: 8px; width: min(820px, 96%); height: min(580px, 82vh); display: flex; flex-direction: column; box-shadow: 0 8px 28px rgba(0,0,0,.35); font-family: system-ui, -apple-system, sans-serif; font-size: 0.94em; animation: ta-slidein .15s ease-out; overflow: hidden; }
                .ta-dialog-header { padding: 11px 16px; background: #f8f9fa; border-bottom: 1px solid #eaecf0; font-weight: 700; font-size: 1.05em; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
                .ta-dialog-header-left { display: flex; align-items: center; gap: 7px; }
                .ta-dialog-close { background: none; border: none; font-size: 1.2em; cursor: pointer; color: #54595d; padding: 0 2px; line-height: 1; }
                .ta-dialog-close:hover { color: #000; }
                .ta-dialog-body { padding: 0; overflow-y: auto; flex: 1; }
                .ta-dialog-footer { padding: 10px 14px; background: #f8f9fa; border-top: 1px solid #eaecf0; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0; }
                .ta-dialog-footer-right { display: flex; gap: 7px; }
                .ta-dialog-sm { width: min(720px, 96%); height: auto; max-height: 85vh; }
                .ta-toolbar { padding: 9px 14px; background: #f0f2f5; border-bottom: 1px solid #eaecf0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                .ta-toolbar label { display: flex; align-items: center; gap: 5px; font-size: 0.87em; font-weight: 600; cursor: pointer; }
                .ta-filter-age { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 0.85em; }
                .ta-filter-age select { padding: 2px 6px; border: 1px solid #a2a9b1; border-radius: 3px; font-size: 0.95em; }
                .ta-thread-table { width: 100%; border-collapse: collapse; font-size: 0.88em; table-layout: fixed; min-width: 700px; }
                .ta-col-check  { width: 36px; }
                .ta-col-ts     { width: 110px; }
                .ta-col-year   { width: 82px; }
                .ta-col-dest   { width: 190px; }
                .ta-col-status { width: 96px; }
                .ta-thread-table th { padding: 7px 12px; background: #f8f9fa; border-bottom: 2px solid #eaecf0; text-align: left; font-weight: 600; white-space: normal; word-wrap: break-word; position: sticky; top: 0; z-index: 1; }
                .ta-thread-table td { padding: 8px 12px; border-bottom: 1px solid #eaecf0; vertical-align: middle; }
                .ta-thread-table tr:last-child td { border-bottom: none; }
                .ta-thread-table tr.ta-selected td { background: #eaf0fb; }
                .ta-thread-table tr:hover td { background: #f4f7fc; }
                .ta-thread-table tr.ta-selected:hover td { background: #ddeaf9; }
                .ta-thread-table .ta-td-check { text-align: center; }
                .ta-td-title  { word-break: break-word; overflow: hidden; }
                .ta-td-ts     { white-space: nowrap; color: #54595d; overflow: hidden; text-overflow: ellipsis; }
                .ta-td-year   { text-align: center; }
                .ta-td-dest   { color: #3366cc; font-size: 0.85em; word-break: break-all; }
                .ta-td-status { text-align: center; }
                .ta-year-sel { padding: 2px 4px; border: 1px solid #a2a9b1; border-radius: 3px; font-size: 0.9em; width: 70px; cursor: pointer; background: #fff; color: #202122; }
                .ta-year-sel.ta-year-override { border-color: #d4730a; background: #fff8ee; color: #7a3a00; font-weight: 700; }
                .ta-year-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 0.88em; }
                .ta-year-row label { color: #54595d; white-space: nowrap; }
                .ta-year-row select { padding: 3px 6px; border: 1px solid #a2a9b1; border-radius: 3px; font-size: 1em; cursor: pointer; }
                .ta-year-row select.ta-year-override { border-color: #d4730a; background: #fff8ee; color: #7a3a00; font-weight: 700; }
                .ta-dest-preview { color: #3366cc; font-size: 0.87em; word-break: break-all; margin-top: 4px; }
                .ta-badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 0.8em; font-weight: 600; }
                .ta-badge-pending  { background: #eaf0fb; color: #2a55a8; }
                .ta-badge-loading  { background: #fef6e4; color: #705000; }
                .ta-badge-ok       { background: #d5f5e3; color: #1a6b3a; }
                .ta-badge-error    { background: #fde8e8; color: #b00; }
                .ta-badge-skipped  { background: #f0f0f0; color: #555; }
                .ta-footer-info { font-size: 0.83em; color: #54595d; }
                .ta-confirm-list { margin: 8px 0 0; padding: 0; list-style: none; border: 1px solid #eaecf0; border-radius: 4px; }
                .ta-confirm-list li { padding: 6px 10px; border-bottom: 1px solid #eaecf0; font-size: 0.87em; }
                .ta-confirm-list li:last-child { border-bottom: none; }
                .ta-confirm-list .ta-dest { color: #3366cc; font-size: 0.82em; }
                .ta-dialog-body-pad { padding: 14px 16px; }
                .ta-progress-log { margin-top: 10px; font-size: 0.85em; color: #54595d; min-height: 1.5em; }
                @keyframes ta-fadein  { from { opacity:0 } to { opacity:1 } }
                @keyframes ta-slidein { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
                @media (prefers-color-scheme: dark) {
                    .ta-dialog { background:#1e1e1e; color:#eaecf0; border-color:#54595d; }
                    .ta-dialog-header, .ta-dialog-footer { background:#2a2a2a; border-color:#3a3a3a; }
                    .ta-toolbar { background:#252525; border-color:#3a3a3a; }
                    .ta-thread-table th { background:#252525; border-color:#3a3a3a; }
                    .ta-thread-table td { border-color:#3a3a3a; }
                    .ta-thread-table tr.ta-selected td { background:#1a2a45; }
                    .ta-thread-table tr:hover td { background:#252535; }
                    .ta-thread-table tr.ta-selected:hover td { background:#1e3050; }
                    .ta-td-ts, .ta-footer-info, .ta-progress-log, .ta-year-row label { color:#a2a9b1; }
                    .ta-td-dest, .ta-dest-preview, .ta-confirm-list .ta-dest { color:#6699ff; }
                    .ta-confirm-list { border-color:#3a3a3a; }
                    .ta-confirm-list li { border-color:#3a3a3a; }
                    .ta-filter-age select { background:#2a2a2a; color:#eaecf0; border-color:#54595d; }
                    .ta-year-sel { background:#2a2a2a; color:#eaecf0; border-color:#54595d; }
                    .ta-year-sel.ta-year-override { background:#2d1a00; color:#ffc060; border-color:#a06000; }
                    .ta-year-row select { background:#2a2a2a; color:#eaecf0; border-color:#54595d; }
                    .ta-year-row select.ta-year-override { background:#2d1a00; color:#ffc060; border-color:#a06000; }
                    .tng-btn { border-color:#54595d; color:#eaecf0; }
                    .tng-btn-primary { border-color:#6699ff; background:#6699ff; }
                    .tng-btn-primary:hover:not(:disabled) { background:#4f7bd9; border-color:#4f7bd9; }
                    .tng-btn-quiet:hover:not(:disabled) { background: #2a2a35; }
                    .tng-btn-destructive { border-color:#ff6b6b; background:#ff6b6b; }
                    .tng-btn-destructive:hover:not(:disabled) { background:#cc5555; border-color:#cc5555; }
                    .tng-btn-inline:hover:not(:disabled) { background:#252535; border-color:#6699ff; }
                }
            `);
    }
  }

  // ============================================================================
  // [Module 06] Application orchestration controller
  // ============================================================================
  class GadgetController {
    constructor() {
      this.apiService = new WikiApiService();
      this.localeEngine = new LocalisationEngine(this.apiService);
      this.uiManager = new ArchiveUIManager();
      this.archiveSubpage = ArchiveConfig.getArchiveSubpagePrefix();
      this.threads = [];
      this.internalState = [];
      this.filterDays = 0;
      this.portletLink = null;

      // Cache the initial page state to fix TOCTOU via optimistic locking.
      this.initialWikitext = "";
      this.initialBaseTimestamp = "";
    }

    async initialise() {
      this.renderSystemPortlets();

      if (!IS_ALLOWED_CONTEXT) return;

      try {
        const [source] = await Promise.all([
          this.apiService.getPageSourceData(),
          this.localeEngine.initialiseSubsystem(),
        ]);

        if (!source.text) return;

        this.initialWikitext = source.text;
        this.initialBaseTimestamp = source.baseTimestamp;

        this.threads = WikitextParser.dissectThreads(source.text);
        this.updatePortletLabel();
        this.bindInlineSectionButtons();
      } catch (error) {
        console.error("[KirokuHokanki] Initialisation failed:", error);
      }
    }

    getArchiveDestinationPath(year) {
      const pageTitle =
        mwConfig.wgFormattedNamespaces[mwConfig.wgNamespaceNumber] +
        ":" +
        mwConfig.wgTitle;
      return `${pageTitle}/${this.archiveSubpage}/${year}`;
    }

    renderSystemPortlets() {
      this.portletLink = mw.util.addPortletLink(
        "p-cactions",
        "#",
        "📜 Kiroku Hōkan-ki",
        "ca-kiroku-hokanki",
        "Open Kiroku Hōkan-ki archive manager",
      );

      $(this.portletLink).on("click", (event) => {
        event.preventDefault();
        if (!IS_ALLOWED_CONTEXT) {
          this.displayCaveatNotice();
        } else if (!this.threads.length) {
          this.displayEmptyWarningNotice();
        } else {
          this.openBulkArchivePanel();
        }
      });
    }

    updatePortletLabel() {
      if (this.threads.length && this.portletLink) {
        const targetLink =
          this.portletLink.querySelector("a") || this.portletLink;
        targetLink.textContent = `📜 Kiroku Hōkan-ki (${this.threads.length})`;
      }
    }

    bindInlineSectionButtons() {
      const headingNodes = Array.from(
        document.querySelectorAll("#mw-content-text h2"),
      );
      headingNodes.forEach((heading, index) => {
        const threadItem = this.threads[index];
        if (!threadItem || heading.querySelector(".tng-btn-inline")) return;

        const inlineBtn = document.createElement("button");
        inlineBtn.className = "tng-btn tng-btn-inline";
        inlineBtn.textContent = "📜";
        inlineBtn.title = "Archive with Kiroku Hōkan-ki";

        inlineBtn.addEventListener("click", (event) => {
          event.preventDefault();
          this.openSingleArchivePanel(threadItem, inlineBtn);
        });

        const structuralEditSection = heading.querySelector(".mw-editsection");
        if (structuralEditSection)
          heading.insertBefore(inlineBtn, structuralEditSection);
        else heading.appendChild(inlineBtn);
      });
    }

    /**
     * Displays a small informational dialogue with a single Close button.
     * Used by displayCaveatNotice and displayEmptyWarningNotice to avoid
     * duplicating the dialogue scaffolding.
     */
    _showInfoNotice(title, bodyHtml) {
      const { body, footerRight, close } = this.uiManager.instantiateDialog({
        title,
        icon: "📜",
        small: true,
      });
      const pad = document.createElement("div");
      pad.className = "ta-dialog-body-pad";
      pad.innerHTML = bodyHtml;
      body.appendChild(pad);
      ArchiveUIManager.generateButton(
        "Close",
        "mw-ui-quiet",
        close,
        footerRight,
      );
    }

    displayCaveatNotice() {
      this._showInfoNotice(
        "Kiroku Hōkan-ki",
        `<p style="margin:0; font-weight:bold; color:#b00;">Feature restricted</p>
         <p style="margin:8px 0 0;color:#54595d;font-size:0.9em">
           This feature can only be used on specific talk pages by authorised users.
         </p>`,
      );
    }

    displayEmptyWarningNotice() {
      this._showInfoNotice(
        "Kiroku Hōkan-ki",
        `<p style="margin:0">No discussions were found on this talk page.</p>
         <p style="margin:8px 0 0;color:#54595d;font-size:0.9em">
           Kiroku Hōkan-ki only detects sections created with standard level-2 headings (<code>== &hellip; ==</code>).
         </p>`,
      );
    }

    openBulkArchivePanel() {
      const currentYear = new Date().getUTCFullYear();
      this.internalState = this.threads.map((thread, relativeIdx) => ({
        id: relativeIdx,
        thread: thread,
        timestamp: null,
        tsLoaded: false,
        year: currentYear,
        archiveTitle: this.getArchiveDestinationPath(currentYear),
        status: "pending",
        selected: false,
        yearOverride: false,
      }));

      this.filterDays = 0;

      const { body, footer, footerRight, close } =
        this.uiManager.instantiateDialog({
          title: "Kiroku Hōkan-ki — Bulk archive manager",
          icon: "📜",
        });

      const interfaceWrapper = document.createElement("div");
      interfaceWrapper.innerHTML = `
                <div class="ta-toolbar">
                    <button class="tng-btn tng-btn-quiet" id="ta-load-ts-btn" style="font-size:0.85em;">🔄 Scan timestamps</button>
                    <div class="ta-filter-age">
                        <span>Filter:</span>
                        <select id="ta-filter-sel">
                            <option value="0">All discussions</option>
                            <option value="7">Older than 7 days</option>
                            <option value="14">Older than 14 days</option>
                            <option value="30">Older than 30 days</option>
                            <option value="90">Older than 90 days</option>
                        </select>
                    </div>
                    ${
                      ArchiveConfig.CHRONOLOGICAL_ALIGNMENT
                        ? `
                    <label title="Ensures no thread is assigned an older date than the one above it in document order">
                        <input type="checkbox" id="ta-align-chk"> Chronological-order alignment
                    </label>`
                        : ""
                    }
                </div>
                <div style="overflow-x:auto;">
                    <table class="ta-thread-table">
                        <colgroup>
                            <col class="ta-col-check">
                            <col>
                            <col class="ta-col-ts">
                            <col class="ta-col-year">
                            <col class="ta-col-dest">
                            <col class="ta-col-status">
                        </colgroup>
                        <thead>
                            <tr>
                                <th class="ta-td-check"><input type="checkbox" id="ta-chk-all"></th>
                                <th>Discussion topic</th>
                                <th class="ta-td-ts">Last active</th>
                                <th class="ta-td-year">Archive year</th>
                                <th>Archive path</th>
                                <th class="ta-td-status">Status</th>
                            </tr>
                        </thead>
                        <tbody id="ta-tbody"></tbody>
                    </table>
                </div>`;

      body.appendChild(interfaceWrapper);

      const tbody = interfaceWrapper.querySelector("#ta-tbody");
      const selectAllCheck = interfaceWrapper.querySelector("#ta-chk-all");
      const fetchTimestampsBtn =
        interfaceWrapper.querySelector("#ta-load-ts-btn");
      const filterDropdown = interfaceWrapper.querySelector("#ta-filter-sel");

      let alignEnabled = false;
      const alignCheckbox = interfaceWrapper.querySelector("#ta-align-chk");
      if (alignCheckbox) {
        alignCheckbox.addEventListener("change", (e) => {
          alignEnabled = e.target.checked;
          if (alignEnabled) {
            WikitextParser.applyChronologicalAlignment(this.internalState);
            // Propagate updated years to archive titles.
            this.internalState.forEach((item) => {
              if (item.tsLoaded && item.timestamp) {
                item.archiveTitle = this.getArchiveDestinationPath(item.year);
              }
            });
          } else {
            // Revert aligned items to their originally scanned timestamps by
            // re-running a full timestamp rescan on the existing content.
            const sharedMonthsMap = this.localeEngine.getMonthMap();
            this.internalState.forEach((item) => {
              if (!item.tsLoaded) return;
              const original = WikitextParser.computeThreadActivityDate(
                item.thread.content,
                sharedMonthsMap,
              );
              item.timestamp = original;
              item.aligned = false;
              if (!item.yearOverride) {
                item.year = original
                  ? original.getUTCFullYear()
                  : new Date().getUTCFullYear();
                item.archiveTitle = this.getArchiveDestinationPath(item.year);
              }
            });
          }
          this.renderTableRows(tbody);
          this.updateFooterCounters(submitBatchBtn, footerInfo);
        });
      }

      fetchTimestampsBtn.className = "tng-btn tng-btn-quiet";

      const footerInfo = document.createElement("div");
      footerInfo.id = "ta-footer-info";
      footerInfo.className = "ta-footer-info";

      // footerRight is already appended to footer by instantiateDialog.
      // Insert the left-side info label before it.
      footer.insertBefore(footerInfo, footerRight);

      const submitBatchBtn = ArchiveUIManager.generateButton(
        "Archive selected with Kiroku Hōkan-ki",
        "mw-ui-progressive",
        () => this.triggerBatchExecutionFlow(tbody),
        footerRight,
      );
      submitBatchBtn.disabled = true;

      tbody.addEventListener("change", (event) => {
        const historicalRow = event.target.closest("tr");
        if (!historicalRow) return;

        const itemIndex = parseInt(historicalRow.dataset.indexId, 10);
        const localStateItem = this.internalState.find(
          (i) => i.id === itemIndex,
        );
        if (!localStateItem) return;

        if (event.target.classList.contains("ta-row-chk")) {
          localStateItem.selected = event.target.checked;
          historicalRow.classList.toggle(
            "ta-selected",
            localStateItem.selected,
          );
          this.updateFooterCounters(submitBatchBtn, footerInfo);
        }

        if (event.target.classList.contains("ta-row-year")) {
          const parsedYear = parseInt(event.target.value, 10);
          localStateItem.year = parsedYear;
          localStateItem.archiveTitle =
            this.getArchiveDestinationPath(parsedYear);

          if (localStateItem.tsLoaded) {
            const referenceYear = localStateItem.timestamp
              ? localStateItem.timestamp.getUTCFullYear()
              : new Date().getUTCFullYear();
            localStateItem.yearOverride = parsedYear !== referenceYear;
          } else {
            // No scan has run yet; any manual selection is an intentional override.
            localStateItem.yearOverride = true;
          }

          historicalRow.querySelector(".ta-row-dest").textContent =
            localStateItem.archiveTitle;
          event.target.className = localStateItem.yearOverride
            ? "ta-year-sel ta-year-override"
            : "ta-year-sel";
        }
      });

      selectAllCheck.addEventListener("change", (event) => {
        const targetState = event.target.checked;
        const activeSet = this.computeFilteredDataSubset();
        activeSet.forEach((item) => {
          item.selected = targetState;
        });
        this.renderTableRows(tbody);
        this.updateFooterCounters(submitBatchBtn, footerInfo);
      });

      filterDropdown.addEventListener("change", (event) => {
        this.filterDays = parseInt(event.target.value, 10);
        this.renderTableRows(tbody);
        this.updateFooterCounters(submitBatchBtn, footerInfo);
      });

      fetchTimestampsBtn.addEventListener("click", async () => {
        fetchTimestampsBtn.disabled = true;
        fetchTimestampsBtn.textContent = "⏳ Scanning...";

        const activeSet = this.computeFilteredDataSubset();
        const sharedMonthsMap = this.localeEngine.getMonthMap();

        for (const rowItem of activeSet) {
          if (rowItem.tsLoaded) continue;
          rowItem.status = "loading";
          this.updateRowUIStatus(tbody, rowItem.id);

          const signatureDate = WikitextParser.computeThreadActivityDate(
            rowItem.thread.content,
            sharedMonthsMap,
          );
          rowItem.timestamp = signatureDate;
          rowItem.tsLoaded = true;

          if (!rowItem.yearOverride && signatureDate) {
            rowItem.year = signatureDate.getUTCFullYear();
            rowItem.archiveTitle = this.getArchiveDestinationPath(rowItem.year);
          }
          rowItem.status = "pending";
          this.updateRowUIStatus(tbody, rowItem.id);
        }

        // If alignment is active, re-apply it after every rescan so newly
        // loaded timestamps are clamped correctly.
        if (alignEnabled) {
          WikitextParser.applyChronologicalAlignment(this.internalState);
          this.internalState.forEach((item) => {
            if (item.tsLoaded && item.timestamp) {
              item.archiveTitle = this.getArchiveDestinationPath(item.year);
            }
          });
        }

        fetchTimestampsBtn.disabled = false;
        fetchTimestampsBtn.textContent = "🔄 Rescan timestamps";
        this.renderTableRows(tbody);
      });

      this.renderTableRows(tbody);
      this.updateFooterCounters(submitBatchBtn, footerInfo);
    }

    computeFilteredDataSubset() {
      if (this.filterDays === 0) return this.internalState;
      const MS_PER_DAY = 86400000;
      const cutoff = Date.now() - this.filterDays * MS_PER_DAY;
      return this.internalState.filter(
        (item) =>
          !item.tsLoaded ||
          (item.timestamp && item.timestamp.getTime() < cutoff),
      );
    }

    updateFooterCounters(buttonRef, infoRef) {
      const count = this.internalState.filter((i) => i.selected).length;
      infoRef.textContent = `${count} discussion${count !== 1 ? "s" : ""} selected for processing`;
      buttonRef.disabled = count === 0;
    }

    renderTableRows(tbodyElement) {
      tbodyElement.innerHTML = "";
      const currentSubset = this.computeFilteredDataSubset();

      if (!currentSubset.length) {
        tbodyElement.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:18px;color:#72777d">No discussions match the selected filters.</td></tr>`;
        return;
      }

      // Build the year option HTML once per render pass rather than per row.
      const yearOptionHtml = WikitextParser.buildYearOptionHtml();

      currentSubset.forEach((item) => {
        const tr = document.createElement("tr");
        tr.dataset.indexId = item.id;
        if (item.selected) tr.className = "ta-selected";

        const isoDateDisplay = WikitextParser.buildDateDisplayHtml(
          item.timestamp,
          item.tsLoaded,
          item.aligned === true,
        );
        const badgeHtml = this.generateBadgeMarkup(item.status);

        tr.innerHTML = `
                    <td class="ta-td-check"><input type="checkbox" class="ta-row-chk" ${item.selected ? "checked" : ""}></td>
                    <td class="ta-td-title"><b>${mw.html.escape(item.thread.titleClean)}</b></td>
                    <td class="ta-td-ts">${isoDateDisplay}</td>
                    <td class="ta-td-year">
                        <select class="ta-row-year ${item.yearOverride ? "ta-year-sel ta-year-override" : "ta-year-sel"}">
                            ${yearOptionHtml}
                        </select>
                    </td>
                    <td class="ta-td-dest ta-row-dest">${mw.html.escape(item.archiveTitle)}</td>
                    <td class="ta-td-status status-container">${badgeHtml}</td>`;

        tr.querySelector(".ta-row-year").value = item.year;
        tbodyElement.appendChild(tr);
      });
    }

    updateRowUIStatus(tbodyElement, targetItemId) {
      const rowNode = tbodyElement.querySelector(
        `tr[data-index-id="${targetItemId}"]`,
      );
      if (!rowNode) return;
      const targetItem = this.internalState.find((i) => i.id === targetItemId);
      if (!targetItem) return;

      rowNode.querySelector(".status-container").innerHTML =
        this.generateBadgeMarkup(targetItem.status);
    }

    generateBadgeMarkup(status) {
      const BADGE_MAP = {
        pending: ["ta-badge-pending", "—"],
        loading: ["ta-badge-loading", "⏳ Scanning..."],
        ok: ["ta-badge-ok", "✅ Archived"],
        error: ["ta-badge-error", "❌ Error"],
        skipped: ["ta-badge-skipped", "Skipped"],
      };
      const [stylingClass, labelText] = BADGE_MAP[status] || BADGE_MAP.pending;
      return `<span class="ta-badge ${stylingClass}">${labelText}</span>`;
    }

    async triggerBatchExecutionFlow(tbodyElement) {
      const selectedItems = this.internalState.filter((i) => i.selected);
      if (!selectedItems.length) return;

      const { body, footerRight, close } = this.uiManager.instantiateDialog({
        title: "Kiroku Hōkan-ki — Confirm archiving",
        icon: "📜",
        small: true,
      });

      const logPad = document.createElement("div");
      logPad.className = "ta-dialog-body-pad";
      logPad.innerHTML = `<p style='margin:0 0 6px'>The following discussions will be moved to your archives:</p>
                                <ul class='ta-confirm-list' id='ta-confirmation-list-summary'></ul>
                                <div class='ta-progress-log' id='ta-batch-progress-log-terminal'></div>`;
      body.appendChild(logPad);

      const summaryList = logPad.querySelector("#ta-confirmation-list-summary");
      const terminalLog = logPad.querySelector(
        "#ta-batch-progress-log-terminal",
      );

      selectedItems.forEach((item) => {
        const nodeItem = document.createElement("li");
        nodeItem.innerHTML = `<b>${mw.html.escape(item.thread.titleClean)}</b> <div class='ta-dest'>→ ${mw.html.escape(item.archiveTitle)}</div>`;
        summaryList.appendChild(nodeItem);
      });

      const cancelBtn = ArchiveUIManager.generateButton(
        "Cancel",
        "mw-ui-quiet",
        close,
        footerRight,
      );
      const confirmBtn = ArchiveUIManager.generateButton(
        "Confirm archive",
        "mw-ui-progressive",
        async () => {
          confirmBtn.disabled = true;
          cancelBtn.disabled = true;

          terminalLog.textContent = "Starting process...";

          // Group selected items by destination archive page.
          const mappingBatches = new Map();
          selectedItems.forEach((item) => {
            if (!mappingBatches.has(item.archiveTitle))
              mappingBatches.set(item.archiveTitle, []);
            mappingBatches.get(item.archiveTitle).push(item);
          });

          const ATTR = ArchiveConfig.EDIT_SUMMARY_ATTRIBUTION;

          try {
            // Apply optimistic locking: use the initially loaded text and timestamp.
            let globalWikitextBuffer = this.initialWikitext;
            const operationalBaseTimestamp = this.initialBaseTimestamp;
            const successfulThreads = [];

            for (const [archiveSubpagePath, itemsArray] of mappingBatches) {
              terminalLog.textContent = `Saving discussions to ${archiveSubpagePath}...`;

              const mergedWikitext = itemsArray
                .map((i) => i.thread.content.trim())
                .join("\n\n");

              await this.apiService.saveToArchiveTarget(
                archiveSubpagePath,
                mergedWikitext,
                `Moved ${itemsArray.length} discussion(s) to archive subpage ${ATTR}`,
              );
              itemsArray.forEach((i) => {
                i.status = "ok";
                successfulThreads.push(i.thread);
              });
              this.renderTableRows(tbodyElement);
            }

            terminalLog.textContent = "Removing discussions from talk page...";
            successfulThreads.sort((a, b) => b.start - a.start);
            successfulThreads.forEach((thread) => {
              globalWikitextBuffer =
                globalWikitextBuffer.substring(0, thread.start) +
                globalWikitextBuffer.substring(thread.end);
            });

            await this.apiService.updateTalkSourcePage(
              globalWikitextBuffer.trim(),
              `Removed ${successfulThreads.length} archived discussion(s) from talk page ${ATTR}`,
              operationalBaseTimestamp,
            );

            terminalLog.textContent = "Archiving completed successfully!";
            this.renderTableRows(tbodyElement);
            setTimeout(() => {
              close();
              window.location.reload();
            }, 1200);
          } catch (failureError) {
            const errorDetail = classifyApiError(failureError);
            console.error(
              `[KirokuHokanki] Batch archiving failed [${errorDetail.code}]:`,
              failureError,
            );
            terminalLog.innerHTML = `<span style='color:#b00;'>Archiving failed: ${mw.html.escape(errorDetail.message)}</span>`;
            selectedItems.forEach((i) => {
              i.status = "error";
            });
            this.renderTableRows(tbodyElement);
            cancelBtn.disabled = false;
          }
        },
        footerRight,
      );
    }

    async openSingleArchivePanel(threadItem, nativeButtonElement) {
      nativeButtonElement.disabled = true;
      nativeButtonElement.innerHTML = `<span class="ta-btn-spinner"></span>`;

      const { body, footerRight, close } = this.uiManager.instantiateDialog({
        title: "Kiroku Hōkan-ki — Archive section",
        icon: "📜",
        small: true,
        onClose: () => {
          nativeButtonElement.disabled = false;
          nativeButtonElement.textContent = "📜";
        },
      });

      const pad = document.createElement("div");
      pad.className = "ta-dialog-body-pad";
      pad.innerHTML = `<h3>${mw.html.escape(threadItem.titleClean)}</h3><div id='ta-single-workzone'>⏳ Reading dates...</div>`;
      body.appendChild(pad);

      const workzone = pad.querySelector("#ta-single-workzone");

      try {
        const sharedMonthsMap = this.localeEngine.getMonthMap();
        const activityDate = WikitextParser.computeThreadActivityDate(
          threadItem.content,
          sharedMonthsMap,
        );
        const resolvedYear = activityDate
          ? activityDate.getUTCFullYear()
          : new Date().getUTCFullYear();

        let systemSelectedYear = resolvedYear;

        // Shared helper produces consistent date display with the bulk panel.
        const signatureHtml = WikitextParser.buildDateDisplayHtml(activityDate);

        const localRenderRoutine = () => {
          const destinationPath =
            this.getArchiveDestinationPath(systemSelectedYear);
          const isOverride = systemSelectedYear !== resolvedYear;

          workzone.innerHTML = `
                        <p>Last active signature: ${signatureHtml}</p>
                        <div class="ta-year-row">
                            <label for="ta-single-year-select">Archive year:</label>
                            <select id="ta-single-year-select" class="${isOverride ? "ta-year-sel ta-year-override" : "ta-year-sel"}"></select>
                        </div>
                        <div class="ta-dest-preview">Archive path: <b>${mw.html.escape(destinationPath)}</b></div>
                        <div class="ta-progress-log" id="ta-single-execution-terminal-log"></div>`;

          const innerSelect = workzone.querySelector("#ta-single-year-select");
          // Use shared year option builder rather than a local loop.
          innerSelect.innerHTML = WikitextParser.buildYearOptionHtml();
          innerSelect.value = systemSelectedYear;

          innerSelect.addEventListener("change", (e) => {
            systemSelectedYear = parseInt(e.target.value, 10);
            localRenderRoutine();
          });
        };

        localRenderRoutine();

        const ATTR = ArchiveConfig.EDIT_SUMMARY_ATTRIBUTION;

        const singleCancelBtn = ArchiveUIManager.generateButton(
          "Cancel",
          "mw-ui-quiet",
          close,
          footerRight,
        );
        const singleConfirmBtn = ArchiveUIManager.generateButton(
          "Archive with Kiroku Hōkan-ki",
          "mw-ui-progressive",
          async () => {
            singleConfirmBtn.disabled = true;
            singleCancelBtn.disabled = true;

            const terminalNode = workzone.querySelector(
              "#ta-single-execution-terminal-log",
            );
            terminalNode.textContent = "Saving section to archive...";

            try {
              // Apply optimistic locking: use the initially loaded text and timestamp.
              let sourceWikitext = this.initialWikitext;
              const currentBaseTimestamp = this.initialBaseTimestamp;

              const destinationPage =
                this.getArchiveDestinationPath(systemSelectedYear);

              await this.apiService.saveToArchiveTarget(
                destinationPage,
                threadItem.content,
                `Moved section "${threadItem.titleClean}" to archive subpage ${ATTR}`,
              );

              terminalNode.textContent = "Removing section from talk page...";
              sourceWikitext =
                sourceWikitext.substring(0, threadItem.start) +
                sourceWikitext.substring(threadItem.end);

              await this.apiService.updateTalkSourcePage(
                sourceWikitext.trim(),
                `Removed section "${threadItem.titleClean}" from talk page ${ATTR}`,
                currentBaseTimestamp,
              );

              terminalNode.textContent = "Section archived successfully!";
              setTimeout(() => {
                close();
                window.location.reload();
              }, 1000);
            } catch (err) {
              const errorDetail = classifyApiError(err);
              console.error(
                `[KirokuHokanki] Section archiving failed [${errorDetail.code}]:`,
                err,
              );
              terminalNode.innerHTML = `<span style='color:#b00;'>Archiving failed: ${mw.html.escape(errorDetail.message)}</span>`;
              singleCancelBtn.disabled = false;
            }
          },
          footerRight,
        );
      } catch (parsingFailure) {
        workzone.textContent = "Could not parse this section.";
        console.error(parsingFailure);
      }
    }
  }

  // ============================================================================
  // [Bootstrap layer]
  // ============================================================================
  mw.loader.using(["mediawiki.api", "mediawiki.util"]).then(function () {
    $(function () {
      const app = new GadgetController();
      app.initialise();
    });
  });
})();
// </nowiki>
