/**
 * ============================================================================
 * KIROKU HŌKAN-KI — 記録保管機
 * Version 2.0.0
 * Talk Page Archiving Gadget
 * ============================================================================
 * 
 * PURPOSE:
 * An automated Talk Page Archiving Gadget for MediaWiki that streamlines user 
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
    } // User Talk Namespace

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

  // Environment Guardrails
  if (mwConfig.wgUserName !== ArchiveConfig.ALLOWED_USER) return;
  if (mwConfig.wgNamespaceNumber !== ArchiveConfig.TARGET_NAMESPACE) return;
  if (mwConfig.wgTitle !== ArchiveConfig.ALLOWED_USER) return;
  if (
    mwConfig.wgAction === "history" ||
    mwConfig.wgDiffNewId ||
    mwConfig.wgDiffOldId ||
    mwConfig.wgCurRevisionId !== mwConfig.wgRevisionId
  )
    return;

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
  class LocalizationEngine {
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
                const normalizedIndex =
                  primaryMessageKeys.indexOf(msg.name) % 12;
                this.monthMap[cleanTerm] = normalizedIndex + 1;
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
      let cleared = headingTitle.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
      cleared = cleared.replace(/\[\[([^\]]+)\]\]/g, (_match, target) => {
        const elements = target.split(/[:/]/);
        return elements[elements.length - 1].trim();
      });
      return cleared.replace(/<[^>]+>/g, "").trim();
    }

    static dissectThreads(rawWikitext) {
      const regexMatcher = /^==\s*([^=\n][^\n]*?)\s*==\s*$/gm;
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
          re: /(?:(\d{1,2})[.:](\d{2}),\s+)?(\d{1,2})[\s\u200E\u200F.\u00A0]+(\p{L}+)[\s\u200E\u200F.\u00A0]+(\d{4})\b/gu,
          extract: (m) => {
            const targetMonth = monthMap[m[4].toLowerCase().replace(".", "")];
            if (!targetMonth) return null;
            return [+m[5], targetMonth, +m[3], +(m[1] || 0), +(m[2] || 0)];
          },
        },
        {
          id: "global-mdy-signature",
          re: /\b(\p{L}+)[\s\u200E\u200F\u00A0]+(\d{1,2}),\s+(\d{4})(?:\s*,\s*(\d{1,2})[.:](\d{2}))?/gu,
          extract: (m) => {
            const targetMonth = monthMap[m[1].toLowerCase().replace(".", "")];
            if (!targetMonth) return null;
            return [+m[3], targetMonth, +m[2], +(m[4] || 0), +(m[5] || 0)];
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
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffDays < 1) {
        const diffHours = Math.floor(diffMs / 3600000);
        if (diffHours < 1) {
          const diffMins = Math.floor(diffMs / 60000);
          return `~${diffMins || 1} min${diffMins !== 1 ? "s" : ""} ago`;
        }
        return `~${diffHours} hr${diffHours !== 1 ? "s" : ""} ago`;
      }
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
  // [MODULE 05] USER INTERFACE DIALOG MANAGER
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
      buttonElement.className = `mw-ui-button ${styles}`;
      buttonElement.textContent = label;
      buttonElement.addEventListener("click", interactionEvent);
      if (targetParent) targetParent.appendChild(buttonElement);
      return buttonElement;
    }

    injectUtilityStyles() {
      mw.util.addCSS(`
                .ta-btn { display: inline-flex; align-items: center; justify-content: center; margin-left: 8px; padding: 1px 4px; font-size: 0.8em; line-height: 1.4; background: none; border: 1px solid #a2a9b1; border-radius: 3px; cursor: pointer; vertical-align: middle; transition: background .15s, border-color .15s; white-space: nowrap; color: inherit; }
                .ta-btn:hover { background: #eaf0fb; border-color: #36c; }
                .ta-btn:disabled { opacity: .45; cursor: not-allowed; }
                .ta-btn-spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: ta-spin .6s linear infinite; }
                @keyframes ta-spin { to { transform: rotate(360deg); } }
                .ta-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.52); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 12px; animation: ta-fadein .15s ease-out; }
                .ta-dialog { background: #fff; color: #202122; border: 1px solid #a2a9b1; border-radius: 8px; width: min(820px, 96%); max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 8px 28px rgba(0,0,0,.35); font-family: system-ui, -apple-system, sans-serif; font-size: 0.94em; animation: ta-slidein .15s ease-out; overflow: hidden; }
                .ta-dialog-header { padding: 11px 16px; background: #f8f9fa; border-bottom: 1px solid #eaecf0; font-weight: 700; font-size: 1.05em; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
                .ta-dialog-header-left { display: flex; align-items: center; gap: 7px; }
                .ta-dialog-close { background: none; border: none; font-size: 1.2em; cursor: pointer; color: #54595d; padding: 0 2px; line-height: 1; }
                .ta-dialog-close:hover { color: #000; }
                .ta-dialog-body { padding: 0; overflow-y: auto; flex: 1; }
                .ta-dialog-footer { padding: 10px 14px; background: #f8f9fa; border-top: 1px solid #eaecf0; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0; }
                .ta-dialog-footer-right { display: flex; gap: 7px; }
                .ta-dialog-sm { width: min(520px, 96%); }
                .ta-toolbar { padding: 9px 14px; background: #f0f2f5; border-bottom: 1px solid #eaecf0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                .ta-toolbar label { display: flex; align-items: center; gap: 5px; font-size: 0.87em; font-weight: 600; cursor: pointer; }
                .ta-filter-age { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 0.85em; }
                .ta-filter-age select { padding: 2px 6px; border: 1px solid #a2a9b1; border-radius: 3px; font-size: 0.95em; }
                .ta-thread-table { width: 100%; border-collapse: collapse; font-size: 0.88em; }
                .ta-thread-table th { padding: 7px 12px; background: #f8f9fa; border-bottom: 2px solid #eaecf0; text-align: left; font-weight: 600; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
                .ta-thread-table td { padding: 8px 12px; border-bottom: 1px solid #eaecf0; vertical-align: middle; }
                .ta-thread-table tr:last-child td { border-bottom: none; }
                .ta-thread-table tr.ta-selected td { background: #eaf0fb; }
                .ta-thread-table tr:hover td { background: #f4f7fc; }
                .ta-thread-table tr.ta-selected:hover td { background: #ddeaf9; }
                .ta-td-check  { width: 32px; text-align: center; }
                .ta-td-title  { max-width: 240px; word-break: break-word; }
                .ta-td-ts     { white-space: nowrap; color: #54595d; min-width: 90px; }
                .ta-td-year   { width: 80px; text-align: center; }
                .ta-td-dest   { color: #3366cc; font-size: 0.85em; word-break: break-all; }
                .ta-td-status { width: 90px; text-align: center; }
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
                    .ta-btn { border-color:#54595d; color:#eaecf0; }
                    .ta-btn:hover { background:#252535; border-color:#6699ff; }
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
      this.localeEngine = new LocalizationEngine(this.apiService);
      this.uiManager = new ArchiveUIManager();
      this.archiveSubpage = ArchiveConfig.getArchiveSubpagePrefix();
      this.threads = [];
      this.internalState = [];
      this.filterDays = 0;
    }

    async initialise() {
      try {
        const [source] = await Promise.all([
          this.apiService.getPageSourceData(),
          this.localeEngine.initialiseSubsystem(),
        ]);

        if (!source.text) return;

        this.threads = WikitextParser.dissectThreads(source.text);
        this.renderSystemPortlets();
        this.bindInlineSectionButtons();
      } catch (error) {
        console.error(
          "[KirokuHokanki] Initialization execution failed:",
          error,
        );
      }
    }

    getArchiveDestinationPath(year) {
      return `${mwConfig.wgPageName.replace(/_/g, " ")}/${this.archiveSubpage}/${year}`;
    }

    renderSystemPortlets() {
      const portletLabel = this.threads.length
        ? `📜 Kiroku Hokan-ki (${this.threads.length})`
        : "📜 Kiroku Hokan-ki";

      const portletLink = mw.util.addPortletLink(
        "p-cactions",
        "#",
        portletLabel,
        "ca-kiroku-hokanki",
        "Open Kiroku Hokan-ki archive manager",
      );

      $(portletLink).on("click", (event) => {
        event.preventDefault();
        if (!this.threads.length) this.displayEmptyWarningNotice();
        else this.openBulkArchivePanel();
      });
    }

    bindInlineSectionButtons() {
      const headingNodes = Array.from(
        document.querySelectorAll("#mw-content-text h2"),
      );
      headingNodes.forEach((heading, index) => {
        const threadItem = this.threads[index];
        if (!threadItem || heading.querySelector(".ta-btn")) return;

        const inlineBtn = document.createElement("button");
        inlineBtn.className = "ta-btn";
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
                    Kiroku Hokan-ki only detects sections created with standard level-2 headings (<code>== … ==</code>).
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
                    <label for="ta-chk-all"><input type="checkbox" id="ta-chk-all"> Select all</label>
                    <button class="mw-ui-button mw-ui-quiet" id="ta-load-ts-btn" style="font-size:0.85em;">🔄 Scan timestamps</button>
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
                        <thead>
                            <tr>
                                <th class="ta-td-check"></th>
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
          localStateItem.yearOverride = true;
          localStateItem.archiveTitle =
            this.getArchiveDestinationPath(parsedYear);

          historicalRow.querySelector(".ta-row-dest").textContent =
            localStateItem.archiveTitle;
          event.target.className = "ta-year-sel ta-year-override";
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
            isoDateDisplay = `${item.timestamp.toISOString().slice(0, 10)} (${relativeTimeStr})`;
          } else {
            isoDateDisplay = "Not found";
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
            const actualSourcePayload =
              await this.apiService.getPageSourceData();
            let globalWikitextBuffer = actualSourcePayload.text;
            const operationalBaseTimestamp = actualSourcePayload.baseTimestamp;

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
            console.error(
              "[KirokuHokanki] Error inside batch execution flow:",
              failureTransactionError,
            );
            terminalLog.innerHTML = `<span style='color:#b00;'>An error occurred. Please check the browser console for details.</span>`;
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
          workzone.innerHTML = `
                        <p>Last active signature: <b>${mw.html.escape(isoDateString)}</b></p>
                        <div class="ta-year-row">
                            <label for="ta-single-year-select">Archive year:</label>
                            <select id="ta-single-year-select" class="ta-year-sel"></select>
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
              const pageSourcePayload =
                await this.apiService.getPageSourceData();
              let sourceWikitext = pageSourcePayload.text;
              const currentBaseTimestamp = pageSourcePayload.baseTimestamp;

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
              console.error(
                "[KirokuHokanki] Section archive error state encountered:",
                err,
              );
              singleTerminalNode.innerHTML = `<span style='color:#b00;'>Archiving failed. Please check the browser console.</span>`;
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
