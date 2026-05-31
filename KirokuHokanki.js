/**
 * ============================================================================
 * Kiroku Hōkan-ki — 記録保管機
 * Version 2.6.0
 * Semi-automated talk page archiving gadget
 * ============================================================================
 * PURPOSE:
 * An automated talk page archiving gadget for MediaWiki that streamlines user
 * talk page maintenance by moving inactive discussions into subpages.
 *
 * KEY FEATURES:
 * - Automatically splits talk pages into individual threads using level-2 headings.
 * - Parses signature timestamps dynamically across 400+ wiki languages.
 * - Displays friendly relative time strings (e.g., "~2 weeks ago") for active dates.
 * - Allows batch archiving with safe edit-conflict/basetimestamp guardrails.
 * ============================================================================
 */
// <nowiki>

(function () {
  "use strict";

  // ============================================================================
  // [MODULE 01] GLOBAL APP CONFIGURATION
  // ============================================================================
  class ArchiveConfig {
    static get ALLOWED_USER() {
      return "Rachmat04";
    }
    static get TARGET_NAMESPACE() {
      return 3;
    } // User talk namespace

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
  // [UTILITY] API ERROR CLASSIFIER
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
      confirmemail: "You must confirm your e-mail address before editing.",
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
  // [MODULE 02] MEDIAWIKI API SERVICE LAYER
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

    async saveToArchiveTarget(archiveTitle, threadsWikitext, summary) {
      const response = await this.api.get({
        action: "query",
        prop: "revisions",
        rvprop: "content",
        titles: archiveTitle,
        formatversion: 2,
      });
      const page = response.query.pages[0];
      const primaryContent = page.revisions?.[0]?.content || "";
      const formattedPayload = primaryContent
        ? `${primaryContent.trim()}\n\n${threadsWikitext.trim()}\n`
        : `${threadsWikitext.trim()}\n`;

      return this.api.postWithToken("csrf", {
        action: "edit",
        title: archiveTitle,
        text: formattedPayload,
        summary: summary,
      });
    }

    async updateTalkSourcePage(dynamicContent, summary, baseTimestamp) {
      return this.api.postWithToken("csrf", {
        action: "edit",
        title: this.pageName,
        text: dynamicContent,
        summary: summary,
        basetimestamp: baseTimestamp,
      });
    }
  }

  // ============================================================================
  // [MODULE 03] DYNAMIC LOCALISATION ENGINE
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

      const fetchingPromises = ArchiveConfig.TARGET_LANGUAGES.map(
        async (langCode) => {
          try {
            const messages = await this.apiService.fetchSystemMessages(
              langCode,
              primaryMessageKeys,
            );
            messages.forEach((msg) => {
              if (msg.content && !msg.missing) {
                const cleanTerm = msg.content.toLowerCase().trim();
                const normalisedIndex =
                  primaryMessageKeys.indexOf(msg.name) % 12;
                this.monthMap[cleanTerm] = normalisedIndex + 1;
              }
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
  // [MODULE 04] WIKITEXT COMPONENT PARSER
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

    static computeThreadActivityDate(contentBlock, monthMap) {
      const normalisedContent = WikitextParser.normaliseNumerals(contentBlock);
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
      ];

      let newestResolvedDate = null;

      translationPatterns.forEach((pattern) => {
        pattern.re.lastIndex = 0;
        let compositionMatch;
        while (
          (compositionMatch = pattern.re.exec(normalisedContent)) !== null
        ) {
          const fields = pattern.extract(compositionMatch);
          if (fields) {
            const [yr, mo, dy, hr, mn] = fields;

            // Retaining unified UTC construction. This allows exact preservation of
            // the string year from the wikitext without local timezone shifts affecting the year folder logic.
            const baselineCandidate = new Date(
              Date.UTC(yr, mo - 1, dy, hr, mn),
            );

            if (!isNaN(baselineCandidate.getTime())) {
              if (
                !newestResolvedDate ||
                baselineCandidate > newestResolvedDate
              ) {
                newestResolvedDate = baselineCandidate;
              }
            }
          }
        }
      });

      return newestResolvedDate;
    }

    /**
     * Calculates the approximate human-readable relative time string.
     */
    static getRelativeTimeAgo(date) {
      if (!date) return "";
      const diffMs = Date.now() - date.getTime();

      // Guard against future timestamps resulting in negative times
      if (diffMs < 0) return `just now`;

      if (diffMs < 86400000) return `today`;

      const diffDays = Math.floor(diffMs / 86400000);
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
  }

  // ============================================================================
  // [MODULE 05] USER INTERFACE DIALOGUE MANAGER
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
          this.modalStack[this.modalStack.length - 1].closeHandler();
        }
      });
    }

    instantiateDialog(options) {
      const overlay = document.createElement("div");
      overlay.className = "ta-overlay";
      document.body.appendChild(overlay);

      overlay.closeHandler = () => {
        overlay.remove();
        this.modalStack = this.modalStack.filter((m) => m !== overlay);
        if (options.onClose) options.onClose();
      };
      this.modalStack.push(overlay);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.closeHandler();
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
      dismissButton.onclick = () => overlay.closeHandler();

      headerNode.append(internalTitle, dismissButton);

      const bodyNode = document.createElement("div");
      bodyNode.className = "ta-dialog-body";

      const footerNode = document.createElement("div");
      footerNode.className = "ta-dialog-footer";

      dialogBox.append(headerNode, bodyNode, footerNode);
      overlay.appendChild(dialogBox);

      return { overlay, body: bodyNode, footer: footerNode };
    }

    static generateButton(label, styles, interactionEvent, targetParent) {
      const buttonElement = document.createElement("button");
      let classNames = "tng-btn";
      if (styles.includes("mw-ui-quiet")) {
        classNames += " tng-btn-quiet";
      } else if (styles.includes("mw-ui-progressive")) {
        classNames += " tng-btn-primary";
      } else if (styles.includes("mw-ui-destructive")) {
        classNames += " tng-btn-destructive";
      } else {
        classNames += " tng-btn-quiet";
      }
      buttonElement.className = classNames.trim();
      buttonElement.textContent = label;
      buttonElement.addEventListener("click", interactionEvent);
      if (targetParent) targetParent.appendChild(buttonElement);
      return buttonElement;
    }

    injectUtilityStyles() {
      mw.util.addCSS(`
                /* --- Tengu-style Buttons --- */
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
                
                /* Custom inline button for Kiroku Hokan-ki */
                .tng-btn-inline {
                    margin-left: 8px;
                    padding: 1px 4px;
                    font-size: 0.8em;
                    line-height: 1.4;
                    border: 1px solid #a2a9b1;
                    border-radius: 3px;
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
                .ta-dialog-sm { width: min(520px, 96%); height: min(290px, 82vh); }
                .ta-toolbar { padding: 9px 14px; background: #f0f2f5; border-bottom: 1px solid #eaecf0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                .ta-toolbar label { display: flex; align-items: center; gap: 5px; font-size: 0.87em; font-weight: 600; cursor: pointer; }
                .ta-filter-age { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 0.85em; }
                .ta-filter-age select { padding: 2px 6px; border: 1px solid #a2a9b1; border-radius: 3px; font-size: 0.95em; }
                .ta-thread-table { width: 100%; border-collapse: collapse; font-size: 0.88em; table-layout: fixed; min-width: 700px; }
                .ta-col-check  { width: 36px; }
                .ta-col-ts     { width: 200px; }
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
                .ta-confirm-list { margin: 8px 0 0; padding: 0; list-style: none; max-height: 200px; overflow-y: auto; border: 1px solid #eaecf0; border-radius: 4px; }
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
  // [MODULE 06] APPLICATION ORCHESTRATION CONTROLLER
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

      // Store initial state to fix TOCTOU vulnerability via optimistic locking
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

        // Cache the initial state to prevent edit conflicts and text mangling
        this.initialWikitext = source.text;
        this.initialBaseTimestamp = source.baseTimestamp;

        this.threads = WikitextParser.dissectThreads(source.text);
        this.updatePortletLabel();
        this.bindInlineSectionButtons();
      } catch (error) {
        console.error(
          "[KirokuHokanki] Initialisation execution failed:",
          error,
        );
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
        "📜 Kiroku Hokan-ki",
        "ca-kiroku-hokanki",
        "Open Kiroku Hokan-ki archive manager",
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
        targetLink.textContent = `📜 Kiroku Hokan-ki (${this.threads.length})`;
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
        inlineBtn.title = "Archive with Kiroku Hokan-ki";

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

    displayCaveatNotice() {
      const { overlay, body, footer } = this.uiManager.instantiateDialog({
        title: "Kiroku Hokan-ki",
        icon: "📜",
        small: true,
      });

      const paddingContainer = document.createElement("div");
      paddingContainer.className = "ta-dialog-body-pad";
      paddingContainer.innerHTML = `
                <p style="margin:0; font-weight:bold; color:#b00;">Feature restricted</p>
                <p style="margin:8px 0 0;color:#54595d;font-size:0.9em">
                    This feature can only be used on specific talk pages by authorised users.
                </p>`;
      body.appendChild(paddingContainer);

      const rightContainer = document.createElement("div");
      rightContainer.className = "ta-dialog-footer-right";
      footer.appendChild(rightContainer);

      ArchiveUIManager.generateButton(
        "Close",
        "mw-ui-quiet",
        () => overlay.closeHandler(),
        rightContainer,
      );
    }

    displayEmptyWarningNotice() {
      const { overlay, body, footer } = this.uiManager.instantiateDialog({
        title: "Kiroku Hokan-ki",
        icon: "📜",
        small: true,
      });

      const paddingContainer = document.createElement("div");
      paddingContainer.className = "ta-dialog-body-pad";
      paddingContainer.innerHTML = `
                <p style="margin:0">No discussions were found on this talk page.</p>
                <p style="margin:8px 0 0;color:#54595d;font-size:0.9em">
                    Kiroku Hokan-ki only detects sections created with standard level-2 headings (<code>== &hellip; ==</code>).
                </p>`;
      body.appendChild(paddingContainer);

      const rightContainer = document.createElement("div");
      rightContainer.className = "ta-dialog-footer-right";
      footer.appendChild(rightContainer);

      ArchiveUIManager.generateButton(
        "Close",
        "mw-ui-quiet",
        () => overlay.closeHandler(),
        rightContainer,
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

      const { body, footer } = this.uiManager.instantiateDialog({
        title: "Kiroku Hokan-ki — Bulk archive manager",
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

      fetchTimestampsBtn.className = "tng-btn tng-btn-quiet";

      const quantitativeFooterInfo = document.createElement("div");
      quantitativeFooterInfo.id = "ta-footer-info";
      quantitativeFooterInfo.className = "ta-footer-info";

      const operationalFooterRight = document.createElement("div");
      operationalFooterRight.className = "ta-dialog-footer-right";

      const submitBatchBtn = ArchiveUIManager.generateButton(
        "Archive selected with Kiroku Hokan-ki",
        "mw-ui-progressive",
        () => this.triggerBatchExecutionFlow(tbody),
        operationalFooterRight,
      );
      submitBatchBtn.disabled = true;

      footer.append(quantitativeFooterInfo, operationalFooterRight);

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
          this.optimiseFooterCounters(submitBatchBtn, quantitativeFooterInfo);
        }

        if (event.target.classList.contains("ta-row-year")) {
          const parsedYear = parseInt(event.target.value, 10);
          localStateItem.year = parsedYear;
          localStateItem.archiveTitle =
            this.getArchiveDestinationPath(parsedYear);

          const referenceYear =
            localStateItem.tsLoaded && localStateItem.timestamp
              ? localStateItem.timestamp.getUTCFullYear()
              : new Date().getUTCFullYear();
          localStateItem.yearOverride = parsedYear !== referenceYear;

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
        this.renderOptimisedTableRows(tbody);
        this.optimiseFooterCounters(submitBatchBtn, quantitativeFooterInfo);
      });

      filterDropdown.addEventListener("change", (event) => {
        this.filterDays = parseInt(event.target.value, 10);
        this.renderOptimisedTableRows(tbody);
        this.optimiseFooterCounters(submitBatchBtn, quantitativeFooterInfo);
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

        fetchTimestampsBtn.disabled = false;
        fetchTimestampsBtn.textContent = "🔄 Rescan timestamps";
        this.renderOptimisedTableRows(tbody);
      });

      this.renderOptimisedTableRows(tbody);
      this.optimiseFooterCounters(submitBatchBtn, quantitativeFooterInfo);
    }

    computeFilteredDataSubset() {
      if (this.filterDays === 0) return this.internalState;
      const maximumHorizonThreshold = Date.now() - this.filterDays * 86400000;
      return this.internalState.filter((item) => {
        return (
          !item.tsLoaded ||
          (item.timestamp && item.timestamp.getTime() < maximumHorizonThreshold)
        );
      });
    }

    optimiseFooterCounters(buttonRef, informationRef) {
      const countedSelections = this.internalState.filter(
        (i) => i.selected,
      ).length;
      informationRef.textContent = `${countedSelections} discussion${countedSelections !== 1 ? "s" : ""} selected for processing`;
      buttonRef.disabled = countedSelections === 0;
    }

    renderOptimisedTableRows(tbodyElement) {
      tbodyElement.innerHTML = "";
      const currentSubset = this.computeFilteredDataSubset();

      if (!currentSubset.length) {
        tbodyElement.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:18px;color:#72777d">No discussions match the selected filters.</td></tr>`;
        return;
      }

      const currentYearSystem = new Date().getUTCFullYear();
      let optionDropdownBuffer = "";
      for (
        let yearIdx = currentYearSystem + 1;
        yearIdx >= currentYearSystem - 15;
        yearIdx--
      ) {
        optionDropdownBuffer += `<option value="${yearIdx}">${yearIdx}</option>`;
      }

      currentSubset.forEach((item) => {
        const tr = document.createElement("tr");
        tr.dataset.indexId = item.id;
        if (item.selected) tr.className = "ta-selected";

        let isoDateDisplay = `<span style="color:#a2a9b1">Not scanned</span>`;
        if (item.tsLoaded) {
          if (item.timestamp) {
            const relativeTimeStr = WikitextParser.getRelativeTimeAgo(
              item.timestamp,
            );
            const isoDateStr = item.timestamp.toISOString().slice(0, 10);
            isoDateDisplay = `${isoDateStr} (${relativeTimeStr})`;
          } else {
            isoDateDisplay = `<span style="color:#a2a9b1" title="No timestamp signature was detected in this thread">No signature found</span>`;
          }
        }

        const calculatedBadge = this.generateBadgeMarkup(item.status);

        tr.innerHTML = `
                    <td class="ta-td-check"><input type="checkbox" class="ta-row-chk" ${item.selected ? "checked" : ""}></td>
                    <td class="ta-td-title"><b>${mw.html.escape(item.thread.titleClean)}</b></td>
                    <td class="ta-td-ts">${isoDateDisplay}</td>
                    <td class="ta-td-year">
                        <select class="ta-row-year ${item.yearOverride ? "ta-year-sel ta-year-override" : "ta-year-sel"}">
                            ${optionDropdownBuffer}
                        </select>
                    </td>
                    <td class="ta-td-dest ta-row-dest">${mw.html.escape(item.archiveTitle)}</td>
                    <td class="ta-td-status status-container">${calculatedBadge}</td>`;

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
      const badgeConfigurationMatrix = {
        pending: ["ta-badge-pending", "—"],
        loading: ["ta-badge-loading", "⏳ Scanning..."],
        ok: ["ta-badge-ok", "✅ Archived"],
        error: ["ta-badge-error", "❌ Error"],
        skipped: ["ta-badge-skipped", "Skipped"],
      };
      const [stylingClass, labelText] =
        badgeConfigurationMatrix[status] || badgeConfigurationMatrix.pending;
      return `<span class="ta-badge ${stylingClass}">${labelText}</span>`;
    }

    async triggerBatchExecutionFlow(tbodyElement) {
      const elementsSelectedForArchiving = this.internalState.filter(
        (i) => i.selected,
      );
      if (!elementsSelectedForArchiving.length) return;

      const { overlay, body, footer } = this.uiManager.instantiateDialog({
        title: "Kiroku Hokan-ki — Confirm archiving",
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

      elementsSelectedForArchiving.forEach((item) => {
        const nodeItem = document.createElement("li");
        nodeItem.innerHTML = `<b>${mw.html.escape(item.thread.titleClean)}</b> <div class='ta-dest'>→ ${mw.html.escape(item.archiveTitle)}</div>`;
        summaryList.appendChild(nodeItem);
      });

      const functionalFooterRight = document.createElement("div");
      functionalFooterRight.className = "ta-dialog-footer-right";
      footer.appendChild(functionalFooterRight);

      const cancelBtn = ArchiveUIManager.generateButton(
        "Cancel",
        "mw-ui-quiet",
        () => overlay.closeHandler(),
        functionalFooterRight,
      );
      const confirmBtn = ArchiveUIManager.generateButton(
        "Confirm archive",
        "mw-ui-progressive",
        async () => {
          confirmBtn.disabled = true;
          cancelBtn.disabled = true;

          terminalLog.textContent = "Starting process...";

          const mappingBatches = new Map();
          elementsSelectedForArchiving.forEach((item) => {
            if (!mappingBatches.has(item.archiveTitle))
              mappingBatches.set(item.archiveTitle, []);
            mappingBatches.get(item.archiveTitle).push(item);
          });

          try {
            // Apply Optimistic Locking: Use the initially loaded text and timestamp
            let globalWikitextBuffer = this.initialWikitext;
            const operationalBaseTimestamp = this.initialBaseTimestamp;
            const processingLogsSuccessful = [];

            for (const [archiveSubpagePath, itemsArray] of mappingBatches) {
              terminalLog.textContent = `Saving discussions to ${archiveSubpagePath}...`;

              const mergedWikitextPayload = itemsArray
                .map((i) => i.thread.content.trim())
                .join("\n\n");
              const targetSummaryDescription = `Archiving discussions to subpage (via [[w:id:Pengguna:Rachmat04/KirokuHokanki.js|⚙️ Kiroku Hokan-ki]])`;

              await this.apiService.saveToArchiveTarget(
                archiveSubpagePath,
                mergedWikitextPayload,
                targetSummaryDescription,
              );
              itemsArray.forEach((i) => {
                i.status = "ok";
                processingLogsSuccessful.push(i.thread);
              });
            }

            terminalLog.textContent = "Removing discussions from talk page...";
            processingLogsSuccessful.sort(
              (alpha, beta) => beta.start - alpha.start,
            );
            processingLogsSuccessful.forEach((threadItem) => {
              globalWikitextBuffer =
                globalWikitextBuffer.substring(0, threadItem.start) +
                globalWikitextBuffer.substring(threadItem.end);
            });

            await this.apiService.updateTalkSourcePage(
              globalWikitextBuffer.trim(),
              `Removing archived discussions (via [[w:id:Pengguna:Rachmat04/KirokuHokanki.js|⚙️ Kiroku Hokan-ki]])`,
              operationalBaseTimestamp,
            );

            terminalLog.textContent = "Archiving completed successfully!";
            this.renderOptimisedTableRows(tbodyElement);
            setTimeout(() => {
              overlay.closeHandler();
              window.location.reload();
            }, 1200);
          } catch (failureTransactionError) {
            const errorDetail = classifyApiError(failureTransactionError);
            console.error(
              `[KirokuHokanki] Batch archiving failed [${errorDetail.code}]:`,
              failureTransactionError,
            );
            terminalLog.innerHTML = `<span style='color:#b00;'>Archiving failed: ${mw.html.escape(errorDetail.message)}</span>`;
            elementsSelectedForArchiving.forEach((i) => {
              i.status = "error";
            });
            this.renderOptimisedTableRows(tbodyElement);
            cancelBtn.disabled = false;
          }
        },
        functionalFooterRight,
      );
    }

    async openSingleArchivePanel(threadItem, nativeButtonElement) {
      nativeButtonElement.disabled = true;
      nativeButtonElement.innerHTML = `<span class="ta-btn-spinner"></span>`;

      const { overlay, body, footer } = this.uiManager.instantiateDialog({
        title: "Kiroku Hokan-ki — Archive section",
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
        const activityDateResolved = WikitextParser.computeThreadActivityDate(
          threadItem.content,
          sharedMonthsMap,
        );
        const resolvedYear = activityDateResolved
          ? activityDateResolved.getUTCFullYear()
          : new Date().getUTCFullYear();

        let systemSelectedYear = resolvedYear;
        const relativeTimeStr = activityDateResolved
          ? ` (${WikitextParser.getRelativeTimeAgo(activityDateResolved)})`
          : "";

        const isoDateString = activityDateResolved
          ? `${activityDateResolved.toISOString().slice(0, 10)}${relativeTimeStr}`
          : "No signature found";

        const localRenderRoutine = () => {
          const destinationPathString =
            this.getArchiveDestinationPath(systemSelectedYear);

          const isYearOverride = systemSelectedYear !== resolvedYear;
          const selectStyleClass = isYearOverride
            ? "ta-year-sel ta-year-override"
            : "ta-year-sel";

          workzone.innerHTML = `
                        <p>Last active signature: <b>${mw.html.escape(isoDateString)}</b></p>
                        <div class="ta-year-row">
                            <label for="ta-single-year-select">Archive year:</label>
                            <select id="ta-single-year-select" class="${selectStyleClass}"></select>
                        </div>
                        <div class="ta-dest-preview">Archive path: <b>${mw.html.escape(destinationPathString)}</b></div>
                        <div class="ta-progress-log" id="ta-single-execution-terminal-log"></div>`;

          const innerSelect = workzone.querySelector("#ta-single-year-select");
          const currentYearSystem = new Date().getUTCFullYear();
          for (
            let yIdx = currentYearSystem + 1;
            yIdx >= currentYearSystem - 15;
            yIdx--
          ) {
            const opt = document.createElement("option");
            opt.value = yIdx;
            opt.textContent = yIdx;
            if (yIdx === systemSelectedYear) opt.selected = true;
            innerSelect.appendChild(opt);
          }

          innerSelect.addEventListener("change", (e) => {
            systemSelectedYear = parseInt(e.target.value, 10);
            localRenderRoutine();
          });
        };

        localRenderRoutine();

        const UIControlsFooterRight = document.createElement("div");
        UIControlsFooterRight.className = "ta-dialog-footer-right";
        footer.appendChild(UIControlsFooterRight);

        const singleCancelBtn = ArchiveUIManager.generateButton(
          "Cancel",
          "mw-ui-quiet",
          () => overlay.closeHandler(),
          UIControlsFooterRight,
        );
        const singleConfirmBtn = ArchiveUIManager.generateButton(
          "Archive with Kiroku Hokan-ki",
          "mw-ui-progressive",
          async () => {
            singleConfirmBtn.disabled = true;
            singleCancelBtn.disabled = true;

            const singleTerminalNode = workzone.querySelector(
              "#ta-single-execution-terminal-log",
            );
            singleTerminalNode.textContent = "Saving section to archive...";

            try {
              // Apply Optimistic Locking: Use the initially loaded text and timestamp
              let sourceWikitext = this.initialWikitext;
              const currentBaseTimestamp = this.initialBaseTimestamp;

              const destinationArchivePage =
                this.getArchiveDestinationPath(systemSelectedYear);
              const modificationSummary = `Archiving section: ${threadItem.titleClean} (via [[w:id:Pengguna:Rachmat04/KirokuHokanki.js|⚙️ Kiroku Hokan-ki]])`;

              await this.apiService.saveToArchiveTarget(
                destinationArchivePage,
                threadItem.content,
                modificationSummary,
              );

              singleTerminalNode.textContent =
                "Removing section from talk page...";
              sourceWikitext =
                sourceWikitext.substring(0, threadItem.start) +
                sourceWikitext.substring(threadItem.end);

              await this.apiService.updateTalkSourcePage(
                sourceWikitext.trim(),
                `Removing archived section: ${threadItem.titleClean} (via [[w:id:Pengguna:Rachmat04/KirokuHokanki.js|⚙️ Kiroku Hokan-ki]])`,
                currentBaseTimestamp,
              );

              singleTerminalNode.textContent = "Section archived successfully!";
              setTimeout(() => {
                overlay.closeHandler();
                window.location.reload();
              }, 1000);
            } catch (err) {
              const errorDetail = classifyApiError(err);
              console.error(
                `[KirokuHokanki] Section archiving failed [${errorDetail.code}]:`,
                err,
              );
              singleTerminalNode.innerHTML = `<span style='color:#b00;'>Archiving failed: ${mw.html.escape(errorDetail.message)}</span>`;
              singleCancelBtn.disabled = false;
            }
          },
          UIControlsFooterRight,
        );
      } catch (parsingFailure) {
        workzone.textContent = "Could not parse this section.";
        console.error(parsingFailure);
      }
    }
  }

  // ============================================================================
  // [BOOTSTRAP LAYER]
  // ============================================================================
  mw.loader.using(["mediawiki.api", "mediawiki.util"]).then(function () {
    $(function () {
      const app = new GadgetController();
      app.initialise();
    });
  });
})();
// </nowiki>
