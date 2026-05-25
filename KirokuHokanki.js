/**
 * [GADGET: Kiroku Hokan-ki (Archive Assistant)]
 * [FUNCTION: Automates talk page discussion archiving based on year.]
 * [SUMMARY: Injects archive buttons into level-2 headings and provides a 
 * bulk-management panel to detect, filter, and move threads to year-based 
 * subpages, while automatically cleaning the source page.]
 * [LIMITATIONS: Only works on talk page namespaces and requires write API access.]
 * [USERS: Restricted to account Rachmat04 (enforced by script).]
 */
// <nowiki>
(function () {
	'use strict';

	// ============================================================================
	// [SECTION 00] USER GUARD
	// Restricts script execution to the designated user account.
	// ============================================================================
	const cfg = mw.config.get();
	const curUser = cfg.wgUserName;
	if (curUser !== 'Rachmat04') return;

	// ============================================================================
	// [SECTION 01] PAGE GUARD
	// Ensures the script only runs on the specific user talk page in view mode.
	// ============================================================================
	if (cfg.wgNamespaceNumber !== 3) return;
	if (cfg.wgTitle !== 'Rachmat04') return;
	if (
		cfg.wgAction === 'history' ||
		cfg.wgDiffNewId ||
		cfg.wgDiffOldId ||
		cfg.wgCurRevisionId !== cfg.wgRevisionId
	) return;

	const api = new mw.Api();
	const PAGE_NAME = cfg.wgPageName;

	// ============================================================================
	// [SECTION 02] ARCHIVE SUBPAGE NAME
	// Determines the localized archive subpage prefix (e.g., Arsip or Archives).
	// ============================================================================
	function getArchiveSubpage() {
		const subdomain = window.location.hostname.split('.')[0];
		const ARSIP_WIKIS = new Set([
			'id', 'ace', 'ban', 'bjn', 'map-bms', 'bbc', 'bew', 'bug',
			'gor', 'jv', 'kge', 'mad', 'btm', 'min', 'nia', 'su'
		]);
		return ARSIP_WIKIS.has(subdomain) ? 'Arsip' : 'Archives';
	}
	const ARCHIVE_SUBPAGE = getArchiveSubpage();

	// ============================================================================
	// [SECTION 03] WIKILINK STRIPPER
	// Cleans wikitext syntax and HTML tags from headings to display plain text.
	// ============================================================================
	function stripWikilinks(title) {
		let out = title.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
		out = out.replace(/\[\[([^\]]+)\]\]/g, (_m, target) => {
			const parts = target.split(/[:/]/);
			return parts[parts.length - 1].trim();
		});
		out = out.replace(/<[^>]+>/g, '');
		return out.trim();
	}

	// ============================================================================
	// [SECTION 04] STYLESHEET
	// Injects CSS for UI components like buttons, dialogs, and the floating button.
	// ============================================================================
	mw.util.addCSS(`
		.ta-btn {
			display: inline-flex; align-items: center; justify-content: center;
			margin-left: 8px; padding: 1px 5px; font-size: 1em; line-height: 1.4;
			background: none; border: 1px solid #a2a9b1; border-radius: 3px;
			cursor: pointer; vertical-align: middle; transition: background .15s, border-color .15s;
			white-space: nowrap; color: inherit;
		}
		.ta-btn:hover { background: #eaf0fb; border-color: #36c; }
		.ta-btn:disabled { opacity: .45; cursor: not-allowed; }

		#ta-fab {
			position: fixed; bottom: 28px; right: 28px; z-index: 9999;
			width: 52px; height: 52px; border-radius: 50%; background: #1a4e8a;
			color: #fff; border: none; font-size: 1.5em; cursor: pointer;
			box-shadow: 0 4px 16px rgba(0,0,0,.32); display: flex;
			align-items: center; justify-content: center; transition: background .15s, transform .1s;
		}
		#ta-fab:hover { background: #153d6e; transform: scale(1.07); }

		#ta-fab-badge {
			position: absolute; top: -4px; right: -4px; background: #d33;
			color: #fff; border-radius: 50%; width: 20px; height: 20px;
			font-size: 0.6em; font-weight: 700; display: flex; align-items: center;
			justify-content: center; pointer-events: none;
		}

		.ta-btn-spinner {
			display: inline-block; width: 10px; height: 10px;
			border: 2px solid rgba(255,255,255,.4); border-top-color: #fff;
			border-radius: 50%; animation: ta-spin .6s linear infinite;
		}
		@keyframes ta-spin { to { transform: rotate(360deg); } }

		.ta-overlay {
			position: fixed; inset: 0; background: rgba(0,0,0,.52); z-index: 100000;
			display: flex; align-items: center; justify-content: center; padding: 12px;
			animation: ta-fadein .15s ease-out;
		}

		.ta-dialog {
			background: #fff; color: #202122; border: 1px solid #a2a9b1; border-radius: 8px;
			width: min(820px, 96%); max-height: 88vh; display: flex; flex-direction: column;
			box-shadow: 0 8px 28px rgba(0,0,0,.35); font-family: system-ui, -apple-system, sans-serif;
			font-size: 0.94em; animation: ta-slidein .15s ease-out; overflow: hidden;
		}
		.ta-dialog-header {
			padding: 11px 16px; background: #f8f9fa; border-bottom: 1px solid #eaecf0;
			font-weight: 700; font-size: 1.05em; display: flex; align-items: center;
			justify-content: space-between; flex-shrink: 0;
		}
		.ta-dialog-header-left { display: flex; align-items: center; gap: 7px; }
		.ta-dialog-close {
			background: none; border: none; font-size: 1.2em; cursor: pointer;
			color: #54595d; padding: 0 2px; line-height: 1;
		}
		.ta-dialog-close:hover { color: #000; }
		.ta-dialog-body { padding: 0; overflow-y: auto; flex: 1; }
		.ta-dialog-footer {
			padding: 10px 14px; background: #f8f9fa; border-top: 1px solid #eaecf0;
			display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0;
		}
		.ta-dialog-footer-right { display: flex; gap: 7px; }

		.ta-dialog-sm { width: min(520px, 96%); }

		.ta-toolbar {
			padding: 9px 14px; background: #f0f2f5; border-bottom: 1px solid #eaecf0;
			display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
		}
		.ta-toolbar label { display: flex; align-items: center; gap: 5px; font-size: 0.87em; font-weight: 600; cursor: pointer; }
		.ta-filter-age { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 0.85em; }
		.ta-filter-age select { padding: 2px 6px; border: 1px solid #a2a9b1; border-radius: 3px; font-size: 0.95em; }

		.ta-thread-table { width: 100%; border-collapse: collapse; font-size: 0.88em; }
		.ta-thread-table th {
			padding: 7px 12px; background: #f8f9fa; border-bottom: 2px solid #eaecf0;
			text-align: left; font-weight: 600; white-space: nowrap; position: sticky; top: 0; z-index: 1;
		}
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

		.ta-year-sel {
			padding: 2px 4px; border: 1px solid #a2a9b1; border-radius: 3px;
			font-size: 0.9em; width: 70px; cursor: pointer; background: #fff; color: #202122;
		}
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
			.ta-td-ts  { color:#a2a9b1; }
			.ta-td-dest { color:#6699ff; }
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

	// ============================================================================
	// [SECTION 05] OVERLAY STACK
	// Tracks active dialogs and handles escape key for graceful closing.
	// ============================================================================
	const overlayStack = [];
	document.addEventListener('keydown', e => {
		if (e.key !== 'Escape') return;
		const top = overlayStack[overlayStack.length - 1];
		if (!top) return;
		top.closeHandler();
	});

	// ============================================================================
	// [SECTION 06] DIALOG UTILITIES
	// DOM helpers to construct and append the UI overlays and dialog modals.
	// ============================================================================
	function createOverlay() {
		const overlay = document.createElement('div');
		overlay.className = 'ta-overlay';
		document.body.appendChild(overlay);
		overlay.closeHandler = () => {
			overlay.remove();
			const idx = overlayStack.indexOf(overlay);
			if (idx !== -1) overlayStack.splice(idx, 1);
		};
		overlayStack.push(overlay);
		return overlay;
	}

	function createDialog(opts) {
		const overlay = createOverlay();
		overlay.closeHandler = () => {
			overlay.remove();
			const idx = overlayStack.indexOf(overlay);
			if (idx !== -1) overlayStack.splice(idx, 1);
			if (opts.onClose) opts.onClose();
		};
		const dialog = document.createElement('div');
		dialog.className = 'ta-dialog' + (opts.small ? ' ta-dialog-sm' : '');

		const header = document.createElement('div');
		header.className = 'ta-dialog-header';
		header.innerHTML =
			`<div class="ta-dialog-header-left">${opts.icon || '📦'} ${mw.html.escape( opts.title )}</div>`;

		const closeBtn = document.createElement('button');
		closeBtn.className = 'ta-dialog-close';
		closeBtn.textContent = '✕';
		closeBtn.title = 'Close';
		closeBtn.addEventListener('click', () => overlay.closeHandler());
		header.appendChild(closeBtn);

		const body = document.createElement('div');
		body.className = 'ta-dialog-body';

		const footer = document.createElement('div');
		footer.className = 'ta-dialog-footer';

		dialog.appendChild(header);
		dialog.appendChild(body);
		dialog.appendChild(footer);
		overlay.appendChild(dialog);

		overlay.addEventListener('click', e => {
			if (e.target === overlay) overlay.closeHandler();
		});

		return {
			overlay,
			dialog,
			header,
			body,
			footer
		};
	}

	function addFooterBtn(container, label, cls, onClick) {
		const b = document.createElement('button');
		b.className = `mw-ui-button ${cls}`;
		b.textContent = label;
		b.addEventListener('click', onClick);
		container.appendChild(b);
		return b;
	}

	// ============================================================================
	// [SECTION 07] THREAD PARSER
	// Parses wikitext into iterable thread objects divided by level-2 headings.
	// ============================================================================
	function parseThreads(wikitext) {
		const re = /^==\s*([^=\n][^\n]*?)\s*==\s*$/gm;
		const pos = [];
		let m;

		while ((m = re.exec(wikitext)) !== null) {
			pos.push({
				title: m[1].trim(),
				start: m.index
			});
		}

		pos.push({
			title: null,
			start: wikitext.length
		});

		return pos.slice(0, -1).map((p, i) => ({
			title: p.title,
			titleClean: stripWikilinks(p.title),
			content: wikitext.substring(p.start, pos[i + 1].start),
			start: p.start,
			end: pos[i + 1].start
		}));
	}

	// ============================================================================
	// [SECTION 08] TIMESTAMP DETECTION
	// Configures multi-language regex patterns and extracts the latest signature dates.
	// ============================================================================
	const TIMESTAMP_CONFIG = {
		monthMaps: {
			EN: {
				january: 1,
				february: 2,
				march: 3,
				april: 4,
				may: 5,
				june: 6,
				july: 7,
				august: 8,
				september: 9,
				october: 10,
				november: 11,
				december: 12,
				jan: 1,
				feb: 2,
				mar: 3,
				apr: 4,
				jun: 6,
				jul: 7,
				aug: 8,
				sep: 9,
				sept: 9,
				oct: 10,
				nov: 11,
				dec: 12
			},
			ID: {
				januari: 1,
				februari: 2,
				maret: 3,
				april: 4,
				mei: 5,
				juni: 6,
				juli: 7,
				agustus: 8,
				september: 9,
				oktober: 10,
				november: 11,
				desember: 12
			},
			AR: {
				'يناير': 1,
				'فبراير': 2,
				'مارس': 3,
				'أبريل': 4,
				'مايو': 5,
				'يونيو': 6,
				'يوليو': 7,
				'أغسطس': 8,
				'سبتمبر': 9,
				'أكتوبر': 10,
				'نوفمبر': 11,
				'ديسمبر': 12
			},
			HE: {
				'ינואר': 1,
				'בינואר': 1,
				'פברואר': 2,
				'בפברואר': 2,
				'מרץ': 3,
				'במרץ': 3,
				'אפריל': 4,
				'באפריל': 4,
				'מאי': 5,
				'במאי': 5,
				'יוני': 6,
				'ביוני': 6,
				'יולי': 7,
				'ביולי': 7,
				'אוגוסט': 8,
				'באוגוסט': 8,
				'ספטמבר': 9,
				'בספטמבר': 9,
				'אוקטובר': 10,
				'באוקטובר': 10,
				'נובמבר': 11,
				'בנובמבר': 11,
				'דצמבר': 12,
				'בדצמבר': 12
			},
			HI: {
				'जनवरी': 1,
				'फ़रवरी': 2,
				'फरवरी': 2,
				'मार्च': 3,
				'अप्रैल': 4,
				'मई': 5,
				'जून': 6,
				'जुलाई': 7,
				'अगस्त': 8,
				'सितंबर': 9,
				'सितम्बर': 9,
				'अक्टूबर': 10,
				'नवंबर': 11,
				'नवम्बर': 11,
				'दिसंबर': 12,
				'दिसम्बर': 12
			},
			PNB: {
				'جنوری': 1,
				'فروری': 2,
				'مارچ': 3,
				'اپریل': 4,
				'مئی': 5,
				'جون': 6,
				'جولائی': 7,
				'اگست': 8,
				'ستمبر': 9,
				'اکتوبر': 10,
				'نومبر': 11,
				'دسمبر': 12
			},
			BN: {
				'জানুয়ারি': 1,
				'ফেব্রুয়ারি': 2,
				'মার্চ': 3,
				'এপ্রিল': 4,
				'মে': 5,
				'জুন': 6,
				'জুলাই': 7,
				'আগস্ট': 8,
				'সেপ্টেম্বর': 9,
				'অক্টোবর': 10,
				'নভেম্বর': 11,
				'ডিসেম্বর': 12
			},
			GOR_MIN: {
				'pebruari': 2,
				'mai': 5,
				'nopember': 11
			},
			NUSANTARA: {
				'januari': 1,
				'januwari': 1,
				'jânuwari': 1,
				'pibuari': 2,
				'februari': 2,
				'pebruari': 2,
				'pèbruari': 2,
				'péberuwari': 2,
				'fèbruari': 2,
				'pabuwari': 2,
				'fèbruwari': 2,
				'pébruari': 2,
				'marit': 3,
				'maret': 3,
				'mareq': 3,
				'april': 4,
				'apperileng': 4,
				'mai': 5,
				'mei': 5,
				'méi': 5,
				'mèi': 5,
				'may': 5,
				'juni': 6,
				'junè': 6,
				'juli': 7,
				'agustus': 8,
				'agussutuq': 8,
				'siptimbir': 9,
				'september': 9,
				'sèptèmber': 9,
				'séttémberéq': 9,
				'séptémber': 9,
				'uktubir': 10,
				'oktober': 10,
				'oqtoberéq': 10,
				'nupimbir': 11,
				'november': 11,
				'nopember': 11,
				'nopèmber': 11,
				'nopémberéq': 11,
				'novèmber': 11,
				'nopémber': 11,
				'disimbir': 12,
				'desember': 12,
				'désèmber': 12,
				'désémberéq': 12,
				'dhésèmber': 12,
				'ḍèsèmber': 12,
				'désémber': 12
			},
			ACE: {
				'buleuen sa': 1,
				'buleuen duwa': 2,
				'buleuen lhèe': 3,
				'buleuen peuet': 4,
				'buleuen limöng': 5,
				'buleuen nam': 6,
				'buleuen tujôh': 7,
				'buleuen lapan': 8,
				'buleuen sikureueng': 9,
				'buleuen siplôh': 10,
				'buleuen siblaih': 11,
				'buleuen duwa blah': 12
			},
			ARZ: {
				'يناير': 1,
				'فبراير': 2,
				'مارس': 3,
				'أبريل': 4,
				'مايو': 5,
				'يونيو': 6,
				'يوليو': 7,
				'أغسطس': 8,
				'سبتمبر': 9,
				'أكتوبر': 10,
				'نوفمبر': 11,
				'ديسمبر': 12
			},
			UR: {
				'جنوری': 1,
				'فروری': 2,
				'مارچ': 3,
				'اپریل': 4,
				'مئی': 5,
				'جون': 6,
				'جولائی': 7,
				'اگست': 8,
				'ستمبر': 9,
				'اکتوبر': 10,
				'نومبر': 11,
				'دسمبر': 12
			},
			BAN: {
				'januari': 1,
				'pébruari': 2,
				'maret': 3,
				'april': 4,
				'méi': 5,
				'juni': 6,
				'juli': 7,
				'agustus': 8,
				'séptémber': 9,
				'oktober': 10,
				'nopémber': 11,
				'désémber': 12
			},
			AF: {
				'januarie': 1,
				'februarie': 2,
				'maart': 3,
				'april': 4,
				'mei': 5,
				'junie': 6,
				'julie': 7,
				'augustus': 8,
				'september': 9,
				'oktober': 10,
				'november': 11,
				'desember': 12
			},
			BR: {
				'genver': 1,
				'c\'hwevrer': 2,
				'meurzh': 3,
				'ebrel': 4,
				'mae': 5,
				'mezheven': 6,
				'gouere': 7,
				'eost': 8,
				'gwengolo': 9,
				'here': 10,
				'du': 11,
				'kerzu': 12
			},
			CZ: {
				'ledna': 1,
				'února': 2,
				'března': 3,
				'dubna': 4,
				'května': 5,
				'června': 6,
				'července': 7,
				'srpna': 8,
				'září': 9,
				'října': 10,
				'listopadu': 11,
				'prosince': 12
			},
			DA: {
				'januar': 1,
				'februar': 2,
				'marts': 3,
				'april': 4,
				'maj': 5,
				'juni': 6,
				'juli': 7,
				'august': 8,
				'september': 9,
				'oktober': 10,
				'november': 11,
				'december': 12
			},
			NL: {
				'januari': 1,
				'februari': 2,
				'maart': 3,
				'april': 4,
				'mei': 5,
				'juni': 6,
				'juli': 7,
				'augustus': 8,
				'september': 9,
				'oktober': 10,
				'november': 11,
				'december': 12
			},
			EO: {
				'januaro': 1,
				'februaro': 2,
				'marto': 3,
				'aprilo': 4,
				'majo': 5,
				'junio': 6,
				'julio': 7,
				'aŭgusto': 8,
				'septembro': 9,
				'oktobro': 10,
				'novembro': 11,
				'decembro': 12
			},
			FI: {
				'tammikuuta': 1,
				'helmikuuta': 2,
				'maaliskuuta': 3,
				'huhtikuuta': 4,
				'toukokuuta': 5,
				'kesäkuuta': 6,
				'heinäkuuta': 7,
				'elokuuta': 8,
				'syyskuuta': 9,
				'lokakuuta': 10,
				'marraskuuta': 11,
				'joulukuuta': 12
			},
			FR: {
				'janvier': 1,
				'février': 2,
				'mars': 3,
				'avril': 4,
				'mai': 5,
				'juin': 6,
				'juillet': 7,
				'août': 8,
				'septembre': 9,
				'octobre': 10,
				'novembre': 11,
				'décembre': 12
			},
			DE: {
				'januar': 1,
				'februar': 2,
				'märz': 3,
				'april': 4,
				'mai': 5,
				'juni': 6,
				'juli': 7,
				'august': 8,
				'september': 9,
				'oktober': 10,
				'november': 11,
				'dezember': 12
			},
			EL: {
				'ιανουαρίου': 1,
				'φεβρουαρίου': 2,
				'μαρτίου': 3,
				'απριλίου': 4,
				'μαΐου': 5,
				'ιουνίου': 6,
				'ιουλίου': 7,
				'αυγούστου': 8,
				'σεπτεμβρίου': 9,
				'οκτωβρίου': 10,
				'νοεμβρίου': 11,
				'δεκεμβρίου': 12
			},
			IT: {
				'gennaio': 1,
				'febbraio': 2,
				'marzo': 3,
				'aprile': 4,
				'maggio': 5,
				'giugno': 6,
				'luglio': 7,
				'agosto': 8,
				'settembre': 9,
				'ottobre': 10,
				'novembre': 11,
				'dicembre': 12
			},
			AVK: {
				'taneaksat': 1,
				'toleaksat': 2,
				'bareaksat': 3,
				'balemeaksat': 4,
				'alubeaksat': 5,
				'teveaksat': 6,
				'pereaksat': 7,
				'anyusteaksat': 8,
				'lerdeaksat': 9,
				'saneaksat': 10,
				'santaneaksat': 11,
				'santoleaksat': 12
			},
			PL: {
				'stycznia': 1,
				'lutego': 2,
				'marca': 3,
				'kwietnia': 4,
				'maja': 5,
				'czerwca': 6,
				'lipca': 7,
				'sierpnia': 8,
				'września': 9,
				'października': 10,
				'listopada': 11,
				'grudnia': 12
			},
			NO: {
				'januar': 1,
				'februar': 2,
				'mars': 3,
				'april': 4,
				'mai': 5,
				'juni': 6,
				'juli': 7,
				'august': 8,
				'september': 9,
				'oktober': 10,
				'november': 11,
				'desember': 12
			},
			NDS: {
				'januar': 1,
				'februar': 2,
				'marz': 3,
				'mär': 3,
				'april': 4,
				'mai': 5,
				'juni': 6,
				'juli': 7,
				'august': 8,
				'aug': 8,
				'september': 9,
				'septemmer': 9,
				'oktober': 10,
				'november': 11,
				'novemmer': 11,
				'dezember': 12,
				'dezemmer': 12
			},
			CY: {
				'ionawr': 1,
				'chwefror': 2,
				'mawrth': 3,
				'ebrill': 4,
				'mai': 5,
				'mehefin': 6,
				'gorffennaf': 7,
				'awst': 8,
				'medi': 9,
				'hydref': 10,
				'tachwedd': 11,
				'rhagfyr': 12
			},
			SV: {
				'januari': 1,
				'februari': 2,
				'mars': 3,
				'april': 4,
				'maj': 5,
				'juni': 6,
				'juli': 7,
				'augusti': 8,
				'september': 9,
				'oktober': 10,
				'november': 11,
				'december': 12
			},
			ES: {
				'enero': 1,
				'febrero': 2,
				'marzo': 3,
				'abril': 4,
				'mayo': 5,
				'junio': 6,
				'julio': 7,
				'agosto': 8,
				'septiembre': 9,
				'octubre': 10,
				'noviembre': 11,
				'diciembre': 12,
				'ene': 1,
				'feb': 2,
				'mar': 3,
				'abr': 4,
				'may': 5,
				'jun': 6,
				'jul': 7,
				'ago': 8,
				'sep': 9,
				'oct': 10,
				'nov': 11,
				'dic': 12
			},
			SI: {
				'ජනවාරි': 1,
				'පෙබරවාරි': 2,
				'මාර්තු': 3,
				'අප්‍රේල්': 4,
				'මැයි': 5,
				'ජූනි': 6,
				'ජූලි': 7,
				'අගෝස්තු': 8,
				'සැප්තැම්බර': 9,
				'ඔක්තෝබර': 10,
				'නොවැම්බර': 11,
				'දෙසැම්බර්': 12
			},
			PT: {
				'janeiro': 1,
				'fevereiro': 2,
				'março': 3,
				'abril': 4,
				'maio': 5,
				'junho': 6,
				'julho': 7,
				'agosto': 8,
				'setembro': 9,
				'outubro': 10,
				'novembro': 11,
				'dezembro': 12
			},
			RU: {
				'января': 1,
				'февраля': 2,
				'марта': 3,
				'апреля': 4,
				'мая': 5,
				'июня': 6,
				'июля': 7,
				'августа': 8,
				'сентября': 9,
				'октября': 10,
				'ноября': 11,
				'декабря': 12
			}
		},

		patterns: [{
				id: 'iso-full',
				re: /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z)?\b/g,
				extract(m) {
					return [+m[1], +m[2], +m[3], +m[4], +m[5]];
				}
			},
			{
				id: 'iso-space',
				re: /\b(\d{4})-(\d{2})-(\d{2})\s+(\d{2})[.:](\d{2})\b(?!\d|:Z)/g,
				extract(m) {
					return [+m[1], +m[2], +m[3], +m[4], +m[5]];
				}
			},
			{
				id: 'dmy-latin',
				re: /\b(?:(\d{1,2}):(\d{2}),\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b(?:\s+(?:pukul\s+)?(\d{1,2})[.:](\d{2}))?/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[4].toLowerCase()];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +(m[6] || m[1] || 0), +(m[7] || m[2] || 0)];
				}
			},
			{
				id: 'mdy',
				re: /\b(?:(\d{1,2}):(\d{2}),\s+)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[3].toLowerCase()];
					if (!mon) return null;
					return [+m[5], mon, +m[4], +(m[1] || 0), +(m[2] || 0)];
				}
			},
			{
				id: 'ymd',
				re: /\b(?:(\d{1,2}):(\d{2}),\s+)?(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})\b/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[4].toLowerCase()];
					if (!mon) return null;
					return [+m[3], mon, +m[5], +(m[1] || 0), +(m[2] || 0)];
				}
			},
			{
				id: 'nusantara',
				re: /\b(?:(\d{1,2}):(\d{2}),\s+)?(\d{1,2})\s+([A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+)\s+(\d{4})\b(?:\s+(\d{1,2})[.:](\d{2}))?/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[4].toLowerCase()];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +(m[6] || m[1] || 0), +(m[7] || m[2] || 0)];
				}
			},
			{
				id: 'ja',
				re: /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(?:\([^)]*\)\s*)?(\d{1,2}):(\d{2})/g,
				extract(m) {
					return [+m[1], +m[2], +m[3], +m[4], +m[5]];
				}
			},
			{
				id: 'zh',
				re: /(?:(\d{1,2}):(\d{2})\s+)?(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(?:\([^)]*\)\s*)?(\d{1,2}):(\d{2}))?/g,
				extract(m) {
					return [+m[3], +m[4], +m[5], +(m[6] || m[1] || 0), +(m[7] || m[2] || 0)];
				}
			},
			{
				id: 'zh-min-nan',
				re: /(\d{4})[\s-]*nî[\s-]*(\d{1,2})[\s-]*goe̍h[\s-]*(\d{1,2})[\s-]*ji̍t(?:\s*\(.*?\))?\s*(\d{1,2}):(\d{2})(?:\s*\(UTC\))?/g,
				extract(m) {
					return [+m[1], +m[2], +m[3], +m[4], +m[5]];
				}
			},
			{
				id: 'ar',
				re: /(\d{1,2}):(\d{2})،\s*(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})(?:\s*\(ت\s*ع\s*م\))?/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[4]];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +m[1], +m[2]];
				}
			},
			{
				id: 'he',
				re: /(\d{1,2}):(\d{2}),[\s\u200E\u200F]+(\d{1,2})[\s\u200E\u200F]+([א-ת]+)[\s\u200E\u200F]+(\d{4})(?:[\s\u200E\u200F]*\([A-Z]+\))?/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[4]];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +m[1], +m[2]];
				}
			},
			{
				id: 'hi',
				re: /(?:(\d{1,2}):(\d{2}),\s+)?(\d{1,2})\s+([\u0900-\u097F]+)\s+(\d{4})(?:\s*\([A-Z]+\))?/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[4]];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +(m[1] || 0), +(m[2] || 0)];
				}
			},
			{
				id: 'pnb',
				re: /(?:([\u0660-\u0669\u06F0-\u06F9]{1,2}):([\u0660-\u0669\u06F0-\u06F9]{2})[,،][\s\u200E\u200F]+)?([\u0660-\u0669\u06F0-\u06F9]{1,2})[\s\u200E\u200F]+([\u0600-\u06FF]+)[\s\u200E\u200F]+([\u0660-\u0669\u06F0-\u06F9]{4})(?:[\s\u200E\u200F]*\([A-Za-z]+\))?/g,
				extract(m, {
					PNB,
					pnbToNum
				}) {
					const mon = PNB[m[4]];
					if (!mon) return null;
					return [pnbToNum(m[5]), mon, pnbToNum(m[3]), pnbToNum(m[1]), pnbToNum(m[2])];
				}
			},
			{
				id: 'ko',
				re: /(\d{4})년\s+(\d{1,2})월\s+(\d{1,2})일(?:\s*\([^)]+\))?\s+(\d{1,2}):(\d{2})/g,
				extract(m) {
					return [+m[1], +m[2], +m[3], +m[4], +m[5]];
				}
			},
			{
				id: 'bn',
				re: /(?:([\u09E6-\u09EF]{1,2}):([\u09E6-\u09EF]{2}),\s+)?([\u09E6-\u09EF]{1,2})\s+([\u0980-\u09FF]+)\s+([\u09E6-\u09EF]{4})(?:\s*\([^)]+\))?/g,
				extract(m, {
					BN,
					bnToNum
				}) {
					const mon = BN[m[4]];
					if (!mon) return null;
					return [bnToNum(m[5]), mon, bnToNum(m[3]), bnToNum(m[1]), bnToNum(m[2])];
				}
			},
			{
				id: 'gor-min',
				re: /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2})[.:](\d{2})(?:\s*\([A-Za-z]+\))?/g,
				extract(m, {
					MONTHS_LATIN
				}) {
					const mon = MONTHS_LATIN[m[2].toLowerCase()];
					if (!mon) return null;
					return [+m[3], mon, +m[1], +m[4], +m[5]];
				}
			},
			{
				id: 'ace',
				re: /\b(\d{1,2})\s+(buleuen\s+(?:sa|duwa\s+blah|duwa|lhèe|peuet|limöng|nam|tujôh|lapan|sikureueng|siplôh|siblaih))\s+(\d{4})\s+(\d{1,2})[.:](\d{2})(?:\s*\([A-Za-z]+\))?/gi,
				extract(m, {
					ACE
				}) {
					const mon = ACE[m[2].toLowerCase().replace(/\s+/g, ' ')];
					if (!mon) return null;
					return [+m[3], mon, +m[1], +m[4], +m[5]];
				}
			},
			{
				id: 'arz',
				re: /(\d{1,2}):(\d{2})،\s*(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})/g,
				extract(m, {
					ARZ
				}) {
					const mon = ARZ[m[4]];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +m[1], +m[2]];
				}
			},
			{
				id: 'ur',
				re: /(\d{1,2}):(\d{2})،\s*(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})ء/g,
				extract(m, {
					UR
				}) {
					const mon = UR[m[4]];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +m[1], +m[2]];
				}
			},
			{
				id: 'ban',
				re: /\b(\d{1,2})\s+([A-Za-zéè]+)\s+(\d{4})\s+(\d{1,2})[.:](\d{2})(?:\s*\(WITA\))?/gi,
				extract(m, {
					BAN
				}) {
					const mon = BAN[m[2].toLowerCase()];
					if (!mon) return null;
					return [+m[3], mon, +m[1], +m[4], +m[5]];
				}
			},
			{
				id: 'af',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g,
				extract(m, {
					AF
				}) {
					const mon = AF[m[4].toLowerCase()];
					if (!mon) return null;
					return [+m[5], mon, +m[3], +m[1], +m[2]];
				}
			},
			{
				id: 'br',
				re: /(\d{1,2})\s+([A-Za-z'č]+)\s+(\d{4})\s+da\s+(\d{2}):(\d{2})/gi,
				extract(m, {
					BR
				}) {
					const mon = BR[m[2].toLowerCase()];
					if (!mon) return null;
					return [+m[3], mon, +m[1], +m[4], +m[5]];
				}
			},
			{
				id: 'cz',
				re: /(\d{1,2})\.\s+(\d{1,2})\.\s+(\d{4}),\s+(\d{2}):(\d{2})/g,
				extract(m, {
					CZ
				}) {
					return [+m[3], +m[2], +m[1], +m[4], +m[5]];
				}
			},
			{
				id: 'da',
				re: /(\d{1,2})\.\s+([a-zæøå]+)\s+(\d{4}),\s+(\d{2}):(\d{2})/gi,
				extract(m, {
					DA
				}) {
					const mon = DA[m[2].toLowerCase()];
					return mon ? [+m[3], mon, +m[1], +m[4], +m[5]] : null;
				}
			},
			{
				id: 'nl',
				re: /(\d{1,2})\s+([a-z]+)\s+(\d{4})\s+(\d{2}):(\d{2})/gi,
				extract(m, {
					NL
				}) {
					const mon = NL[m[2].toLowerCase()];
					return mon ? [+m[3], mon, +m[1], +m[4], +m[5]] : null;
				}
			},
			{
				id: 'eo',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\s+([a-z]+)\.\s+(\d{4})/gi,
				extract(m, {
					EO
				}) {
					const mon = EO[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'fi',
				re: /(\d{1,2})\.\s+([a-z]+)\s+(\d{4})\s+kello\s+(\d{2})\.(\d{2})/gi,
				extract(m, {
					FI
				}) {
					const mon = FI[m[2].toLowerCase()];
					return mon ? [+m[3], mon, +m[1], +m[4], +m[5]] : null;
				}
			},
			{
				id: 'fr',
				re: /(\d{1,2})\s+([a-zû]+)\s+(\d{4})\s+à\s+(\d{2}):(\d{2})/gi,
				extract(m, {
					FR
				}) {
					const mon = FR[m[2].toLowerCase()];
					return mon ? [+m[3], mon, +m[1], +m[4], +m[5]] : null;
				}
			},
			{
				id: 'de',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\.\s+([a-z.]+)\s+(\d{4})/gi,
				extract(m, {
					DE
				}) {
					const monthKey = m[4].replace('.', '').toLowerCase();
					const mon = DE[monthKey];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'el',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\s+([Α-Ωα-ωίϊΐόάέύή]+)\s+(\d{4})/g,
				extract(m, {
					EL
				}) {
					const mon = EL[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'it',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/g,
				extract(m, {
					IT
				}) {
					const mon = IT[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'avk',
				re: /(\d{1,2})\s+([a-z]+)\s+(\d{4})\s+à\s+(\d{2}):(\d{2})/g,
				extract(m, {
					AVK
				}) {
					const mon = AVK[m[2].toLowerCase()];
					return mon ? [+m[3], mon, +m[1], +m[4], +m[5]] : null;
				}
			},
			{
				id: 'pl',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/g,
				extract(m, {
					PL
				}) {
					const mon = PL[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'no',
				re: /(\d{1,2})\.\s+([a-z]+)\s+(\d{4})\s+kl\.\s+(\d{2}):(\d{2})/gi,
				extract(m, {
					NO
				}) {
					const mon = NO[m[2].toLowerCase()];
					return mon ? [+m[3], mon, +m[1], +m[4], +m[5]] : null;
				}
			},
			{
				id: 'nds',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\.\s+([a-z.]+)\s+(\d{4})/gi,
				extract(m, {
					NDS
				}) {
					const monthKey = m[4].replace('.', '').toLowerCase();
					const mon = NDS[monthKey];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'cy',
				re: /(\d{1,2}):(\d{2}),\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/gi,
				extract(m, {
					CY
				}) {
					const mon = CY[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'vi',
				re: /(\d{1,2}):(\d{2}),\s+ng\u00e0y\s+(\d{1,2})\s+th\u00e1ng\s+(\d{1,2})\s+n\u0103m\s+(\d{4})/gi,
				extract(m) {
					return [+m[5], +m[4], +m[3], +m[1], +m[2]];
				}
			},
			{
				id: 'sv',
				re: /(\d{1,2})\s+([a-z]+)\s+(\d{4})\s+kl\.\s+(\d{1,2})\.(\d{2})/gi,
				extract(m, {
					SV
				}) {
					const mon = SV[m[2].toLowerCase()];
					return mon ? [+m[3], mon, +m[1], +m[4], +m[5]] : null;
				}
			},
			{
				id: 'es',
				re: /(\d{2}):(\d{2})\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/gi,
				extract(m, {
					ES
				}) {
					const mon = ES[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'si',
				re: /(\d{1,2}):(\d{2}),\s+(\d{1,2})\s+([\u0D80-\u0DFF]+)\s+(\d{4})/g,
				extract(m, {
					SI
				}) {
					const mon = SI[m[4]];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'pt',
				re: /(\d{1,2})h(\d{2})min\s+de\s+(\d{1,2})\s+de\s+([a-z\u00e7]+)\s+de\s+(\d{4})/gi,
				extract(m, {
					PT
				}) {
					const mon = PT[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			},
			{
				id: 'ru',
				re: /(\d{2}):(\d{2}),\s+(\d{1,2})\s+([а-я\u0430-\u044f]+)\s+(\d{4})/gi,
				extract(m, {
					RU
				}) {
					const mon = RU[m[4].toLowerCase()];
					return mon ? [+m[5], mon, +m[3], +m[1], +m[2]] : null;
				}
			}
		]
	};

	async function getThreadLastTimestamp(threadContent) {
		const mm = TIMESTAMP_CONFIG.monthMaps;
		const MONTHS_LATIN = Object.assign({}, mm.EN, mm.ID, mm.AR, mm.HE, mm.HI, mm.PNB, mm.BN, mm
			.GOR_MIN, mm.NUSANTARA);

		function pnbToNum(str) {
			if (!str) return 0;
			return parseInt(
				str.replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660)
				.replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x06F0),
				10
			);
		}

		function bnToNum(str) {
			if (!str) return 0;
			return parseInt(
				str.replace(/[\u09E6-\u09EF]/g, d => d.charCodeAt(0) - 0x09E6),
				10
			);
		}

		const ctx = {
			MONTHS_LATIN,
			...mm,
			pnbToNum,
			bnToNum
		};

		function makeDate(year, month, day, hour, min) {
			if (year < 2001 || year > 2099) return null;
			if (month < 1 || month > 12) return null;
			if (day < 1 || day > 31) return null;
			return new Date(Date.UTC(year, month - 1, day, hour || 0, min || 0, 0));
		}

		const dates = [];

		for (const pat of TIMESTAMP_CONFIG.patterns) {
			pat.re.lastIndex = 0;
			let m;
			while ((m = pat.re.exec(threadContent)) !== null) {
				const parts = pat.extract(m, ctx);
				if (!parts) continue;
				const d = makeDate(...parts);
				if (d) dates.push(d);
			}
		}

		if (!dates.length) {
			const RE_YEAR = /\b(20[012]\d)\b/g;
			let m;
			while ((m = RE_YEAR.exec(threadContent)) !== null) {
				const year = parseInt(m[1], 10);
				if (year >= 2001 && year <= 2099) {
					dates.push(new Date(Date.UTC(year, 0, 1)));
				}
			}
		}

		if (!dates.length) return null;
		return new Date(Math.max(...dates.map(d => d.getTime())));
	}

	// ============================================================================
	// [SECTION 09] ARCHIVE PAGE TITLE HELPER
	// Constructs the full target string for the destination archive page.
	// ============================================================================
	function getArchiveTitle(year) {
		return `${PAGE_NAME.replace(/_/g, ' ')}/${ARCHIVE_SUBPAGE}/${year}`;
	}

	// ============================================================================
	// [SECTION 10] YEAR SELECTOR OPTIONS
	// Populates the HTML options for the archive year dropdown fields.
	// ============================================================================
	function buildYearOptions(selectedYear) {
		const cur = new Date().getUTCFullYear();
		let html = '';
		for (let y = cur + 1; y >= cur - 20; y--) {
			html += `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`;
		}
		return html;
	}

	// ============================================================================
	// [SECTION 11] BATCH ARCHIVE ENGINE
	// Orchestrates MediaWiki API requests to save threads and clean the source page.
	// ============================================================================
	async function archiveBatch(items, onProgress) {
		const report = onProgress || function () {};
		const ok = [];
		const errors = [];

		report('Fetching talk page wikitext…');
		const srcRes = await api.get({
			action: 'query',
			prop: 'revisions',
			rvprop: ['content', 'timestamp'],
			titles: PAGE_NAME,
			formatversion: 2
		});
		const srcPage = srcRes.query.pages[0];
		let srcText = srcPage.revisions[0].content;
		const baseTimestamp = srcPage.revisions[0].timestamp;
		const srcTitle = PAGE_NAME.replace(/_/g, ' ');

		const byArchive = new Map();
		for (const item of items) {
			if (!byArchive.has(item.archiveTitle)) {
				byArchive.set(item.archiveTitle, []);
			}
			byArchive.get(item.archiveTitle).push(item);
		}

		for (const [archiveTitle, arcItems] of byArchive) {
			report(`Saving to ${archiveTitle}…`);
			try {
				const arcRes = await api.get({
					action: 'query',
					prop: 'revisions',
					rvprop: 'content',
					titles: archiveTitle,
					formatversion: 2
				});
				const arcPage = arcRes.query.pages[0];
				let arcText = (arcPage.revisions && arcPage.revisions[0] && arcPage.revisions[0]
					.content) || '';

				const appended = arcItems.map(it => it.thread.content.trim()).join('\n\n');
				arcText = arcText ? `${arcText.trim()}\n\n${appended}\n` : `${appended}\n`;

				const archivedTitles = arcItems.map(it => `"${it.thread.title}"`).join(', ');
				await api.postWithToken('csrf', {
					action: 'edit',
					title: archiveTitle,
					text: arcText.trim(),
					summary: `Archived from [[${srcTitle}]]: ${archivedTitles} (via [[m:User:Rachmat04/KirokuHokanki.js|Kiroku Hokan-ki]])`
				});
				arcItems.forEach(it => ok.push(it.thread.title));
			} catch (err) {
				console.error('[Kiroku Hokan-ki:Rachmat04] archive page error', err);
				arcItems.forEach(it => errors.push({
					title: it.thread.title,
					err
				}));
			}
		}

		const okSet = new Set(ok);
		for (const item of items) {
			if (!okSet.has(item.thread.title)) continue;
			const escaped = item.thread.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			srcText = srcText.replace(new RegExp(escaped), '');
		}
		srcText = srcText.replace(/\n{3,}/g, '\n\n').trim();

		if (ok.length > 0) {
			report('Saving talk page…');
			const archivedList = ok.map(t => `"${t}"`).join(', ');
			await api.postWithToken('csrf', {
				action: 'edit',
				title: PAGE_NAME,
				text: srcText,
				summary: `Archived ${ok.length} section(s): ${archivedList} (via [[m:User:Rachmat04/KirokuHokanki.js|Kiroku Hokan-ki]])`,
				basetimestamp: baseTimestamp
			});
		}

		return {
			ok,
			errors
		};
	}

	async function archiveThread(thread, archiveTitle) {
		const result = await archiveBatch([{
			thread,
			archiveTitle
		}], () => {});
		if (result.errors.length) throw result.errors[0].err;
	}

	// ============================================================================
	// [SECTION 12] EMPTY STATE NOTICE
	// Renders a fallback dialog UI if no valid level-2 sections are found on the page.
	// ============================================================================
	function openEmptyNotice() {
		const {
			overlay,
			body,
			footer
		} = createDialog({
			title: 'Archive Manager',
			icon: '📦',
			small: true
		});
		const bodyPad = document.createElement('div');
		bodyPad.className = 'ta-dialog-body-pad';
		bodyPad.innerHTML = `
			<p style="margin:0">No level-2 sections were found on this talk page.</p>
			<p style="margin:8px 0 0;color:#54595d;font-size:0.9em">
				Kiroku Hokan-ki only detects threads marked with <code>== … ==</code> headings.
			</p>`;
		body.appendChild(bodyPad);

		const footerRight = document.createElement('div');
		footerRight.className = 'ta-dialog-footer-right';
		footer.appendChild(footerRight);
		addFooterBtn(footerRight, 'Close', 'mw-ui-quiet', () => overlay.closeHandler());
	}

	// ============================================================================
	// [SECTION 13] ARCHIVE MANAGER PANEL
	// Renders the main bulk archiving UI, including filtering and table interactions.
	// ============================================================================
	async function openArchiveManager(allThreads) {
		const items = allThreads.map(t => ({
			thread: t,
			ts: null,
			tsLoaded: false,
			year: new Date().getUTCFullYear(),
			archiveTitle: getArchiveTitle(new Date().getUTCFullYear()),
			status: 'pending',
			selected: false
		}));

		let filterDays = 0;

		const {
			overlay,
			body,
			footer
		} = createDialog({
			title: 'Archive Manager',
			icon: '📦',
			onClose: () => {}
		});

		const toolbar = document.createElement('div');
		toolbar.className = 'ta-toolbar';

		const chkAll = document.createElement('input');
		chkAll.type = 'checkbox';
		chkAll.id = 'ta-chk-all';
		const lblAll = document.createElement('label');
		lblAll.htmlFor = 'ta-chk-all';
		lblAll.appendChild(chkAll);
		lblAll.appendChild(document.createTextNode(' Select all'));

		const loadTsBtn = document.createElement('button');
		loadTsBtn.className = 'mw-ui-button mw-ui-quiet';
		loadTsBtn.style.fontSize = '0.85em';
		loadTsBtn.textContent = '🕐 Load timestamps';

		const filterWrap = document.createElement('div');
		filterWrap.className = 'ta-filter-age';
		filterWrap.innerHTML = `<span>Filter:</span>
			<select id="ta-filter-sel">
				<option value="0">All threads</option>
				<option value="7">Older than 7 days</option>
				<option value="14">Older than 14 days</option>
				<option value="21">Older than 21 days</option>
				<option value="30">Older than 30 days</option>
				<option value="60">Older than 60 days</option>
				<option value="90">Older than 90 days</option>
				<option value="180">Older than 180 days</option>
			</select>`;

		toolbar.appendChild(lblAll);
		toolbar.appendChild(loadTsBtn);
		toolbar.appendChild(filterWrap);
		body.appendChild(toolbar);

		const tableWrap = document.createElement('div');
		const table = document.createElement('table');
		table.className = 'ta-thread-table';
		table.innerHTML = `<thead>
			<tr>
				<th class="ta-td-check"></th>
				<th class="ta-td-title">Thread title</th>
				<th class="ta-td-ts">Last active</th>
				<th class="ta-td-year" title="Target archive year — can be changed manually">Year</th>
				<th class="ta-td-dest">Archive destination</th>
				<th class="ta-td-status">Status</th>
			</tr>
		</thead>`;
		const tbody = document.createElement('tbody');
		table.appendChild(tbody);
		tableWrap.appendChild(table);
		body.appendChild(tableWrap);

		const footerInfo = document.createElement('div');
		footerInfo.className = 'ta-footer-info';
		footerInfo.id = 'ta-footer-info';
		footerInfo.textContent = '0 threads selected';

		const footerRight = document.createElement('div');
		footerRight.className = 'ta-dialog-footer-right';
		const cancelBtn = document.createElement('button');
		cancelBtn.className = 'mw-ui-button mw-ui-quiet';
		cancelBtn.textContent = 'Close';
		cancelBtn.addEventListener('click', () => overlay.closeHandler());
		const archiveBtn = document.createElement('button');
		archiveBtn.className = 'mw-ui-button mw-ui-progressive';
		archiveBtn.textContent = 'Archive selected';
		archiveBtn.disabled = true;

		footerRight.appendChild(cancelBtn);
		footerRight.appendChild(archiveBtn);
		footer.appendChild(footerInfo);
		footer.appendChild(footerRight);

		function getVisibleItems() {
			if (filterDays === 0) return items;
			const cutoff = Date.now() - filterDays * 864e5;
			return items.filter(it => !it.tsLoaded || (it.ts && it.ts.getTime() < cutoff));
		}

		function renderBadge(status) {
			const map = {
				pending: ['ta-badge-pending', '—'],
				loading: ['ta-badge-loading', '⏳'],
				ok: ['ta-badge-ok', '✅ Done'],
				error: ['ta-badge-error', '❌ Failed'],
				skipped: ['ta-badge-skipped', 'Skipped']
			};
			const [cls, txt] = map[status] || map.pending;
			return `<span class="ta-badge ${cls}">${txt}</span>`;
		}

		function updateFooterCount() {
			const n = items.filter(it => it.selected).length;
			const el = document.getElementById('ta-footer-info');
			if (el) el.textContent = `${n} thread${n !== 1 ? 's' : ''} selected`;
			archiveBtn.disabled = n === 0;
		}

		function renderTable() {
			tbody.innerHTML = '';
			const visible = getVisibleItems();
			if (!visible.length) {
				const tr = document.createElement('tr');
				tr.innerHTML =
					`<td colspan="6" style="text-align:center;padding:18px;color:#72777d">No threads match the current filter.</td>`;
				tbody.appendChild(tr);
				return;
			}
			visible.forEach((item, vi) => {
				const tr = document.createElement('tr');
				if (item.selected) tr.classList.add('ta-selected');

				const tsText = item.tsLoaded ?
					(item.ts ? item.ts.toISOString().slice(0, 10) : 'Not detected') :
					'<span style="color:#a2a9b1">Not loaded</span>';

				const detectedYear = item.ts ? item.ts.getUTCFullYear() : new Date()
					.getUTCFullYear();
				const isOverride = item.yearOverride && item.yearOverride !== detectedYear;
				const yearSelCls = isOverride ? 'ta-year-sel ta-year-override' :
					'ta-year-sel';
				const displayTitle = mw.html.escape(item.thread.titleClean);

				tr.innerHTML = `
					<td class="ta-td-check"><input type="checkbox" class="ta-row-chk" data-vi="${vi}" ${item.selected ? 'checked' : ''}></td>
					<td class="ta-td-title">${displayTitle}</td>
					<td class="ta-td-ts">${tsText}</td>
					<td class="ta-td-year"><select class="${yearSelCls} ta-row-year" title="Override archive year">${buildYearOptions(item.year)}</select></td>
					<td class="ta-td-dest ta-row-dest">${mw.html.escape(item.archiveTitle)}</td>
					<td class="ta-td-status">${renderBadge(item.status)}</td>`;

				tr.querySelector('.ta-row-chk').addEventListener('change', e => {
					item.selected = e.target.checked;
					tr.classList.toggle('ta-selected', item.selected);
					updateFooterCount();
					const vis = getVisibleItems();
					chkAll.checked = vis.length > 0 && vis.every(it => it.selected);
					chkAll.indeterminate = vis.some(it => it.selected) && !vis.every(
						it => it.selected);
				});

				tr.querySelector('.ta-row-year').addEventListener('change', e => {
					const newYear = parseInt(e.target.value, 10);
					item.year = newYear;
					item.archiveTitle = getArchiveTitle(newYear);
					item.yearOverride = newYear;
					tr.querySelector('.ta-row-dest').textContent = item.archiveTitle;
					const sel = e.target;
					const det = item.ts ? item.ts.getUTCFullYear() : new Date()
						.getUTCFullYear();
					sel.className = (newYear !== det) ?
						'ta-year-sel ta-year-override ta-row-year' :
						'ta-year-sel ta-row-year';
				});

				tbody.appendChild(tr);
			});
			updateFooterCount();
		}

		chkAll.addEventListener('change', () => {
			const vis = getVisibleItems();
			vis.forEach(it => {
				it.selected = chkAll.checked;
			});
			renderTable();
		});

		setTimeout(() => {
			const sel = document.getElementById('ta-filter-sel');
			if (sel) sel.addEventListener('change', e => {
				filterDays = parseInt(e.target.value, 10);
				chkAll.checked = false;
				renderTable();
			});
		}, 0);

		loadTsBtn.addEventListener('click', async () => {
			loadTsBtn.disabled = true;
			loadTsBtn.textContent = '⏳ Loading…';
			for (let i = 0; i < items.length; i++) {
				items[i].status = 'loading';
				renderTable();
				const ts = await getThreadLastTimestamp(items[i].thread.content);
				items[i].ts = ts;
				items[i].tsLoaded = true;
				if (!items[i].yearOverride) {
					items[i].year = ts ? ts.getUTCFullYear() : new Date()
						.getUTCFullYear();
					items[i].archiveTitle = getArchiveTitle(items[i].year);
				}
				items[i].status = 'pending';
				renderTable();
			}
			loadTsBtn.disabled = false;
			loadTsBtn.textContent = '🔄 Refresh timestamps';
		});

		archiveBtn.addEventListener('click', () => {
			const selected = items.filter(it => it.selected);
			if (!selected.length) return;
			openBulkConfirm(selected, items, overlay, renderTable, updateFooterCount,
				archiveBtn, cancelBtn);
		});

		renderTable();
	}

	// ============================================================================
	// [SECTION 14] BULK CONFIRM DIALOG
	// Prompts user for batch verification and triggers execution status logging.
	// ============================================================================
	function openBulkConfirm(selected, allItems, managerOverlay, renderTable, updateFooterCount,
		archiveBtn, cancelBtnOuter) {
		const {
			overlay,
			body,
			footer
		} = createDialog({
			title: `Confirm archiving ${selected.length} thread${selected.length !== 1 ? 's' : ''}`,
			icon: '📋',
			small: true
		});

		const bodyPad = document.createElement('div');
		bodyPad.className = 'ta-dialog-body-pad';
		bodyPad.innerHTML = `<p style="margin:0 0 6px">The following threads will be archived:</p>`;

		const ul = document.createElement('ul');
		ul.className = 'ta-confirm-list';
		selected.forEach(item => {
			const li = document.createElement('li');
			li.innerHTML = `<b>${mw.html.escape(item.thread.titleClean)}</b>
				<div class="ta-dest">→ ${mw.html.escape(item.archiveTitle)}</div>`;
			ul.appendChild(li);
		});
		bodyPad.appendChild(ul);

		const progressLog = document.createElement('div');
		progressLog.className = 'ta-progress-log';
		progressLog.id = 'ta-bulk-progress';
		bodyPad.appendChild(progressLog);
		body.appendChild(bodyPad);

		const footerRight2 = document.createElement('div');
		footerRight2.className = 'ta-dialog-footer-right';
		footer.appendChild(footerRight2);

		const c2 = addFooterBtn(footerRight2, 'Cancel', 'mw-ui-quiet', () => overlay.closeHandler());

		const confirmBtn = addFooterBtn(footerRight2, 'Archive now', 'mw-ui-progressive', async () => {
			confirmBtn.disabled = true;
			c2.disabled = true;
			archiveBtn.disabled = true;
			cancelBtnOuter.disabled = true;
			const progEl = document.getElementById('ta-bulk-progress');

			selected.forEach(it => {
				it.status = 'loading';
			});
			renderTable();

			let batchResult;
			try {
				batchResult = await archiveBatch(
					selected.map(it => ({
						thread: it.thread,
						archiveTitle: it.archiveTitle
					})),
					msg => {
						if (progEl) progEl.textContent = `⏳ ${msg}`;
					}
				);
			} catch (fatalErr) {
				console.error('[Kiroku Hokan-ki:Rachmat04] fatal batch error', fatalErr);
				batchResult = {
					ok: [],
					errors: selected.map(it => ({
						title: it.thread.title,
						err: fatalErr
					}))
				};
			}

			const okSet = new Set(batchResult.ok);
			selected.forEach(it => {
				it.status = okSet.has(it.thread.title) ? 'ok' : 'error';
				it.selected = false;
			});
			renderTable();
			updateFooterCount();

			const doneCount = batchResult.ok.length;
			const errorCount = batchResult.errors.length;
			if (progEl) progEl.innerHTML =
				`<b>Done.</b> ${doneCount} succeeded, ${errorCount} failed.` + (errorCount ?
					' Check the browser console for details.' : '');

			footerRight2.innerHTML = '';
			addFooterBtn(footerRight2, 'Close & reload', 'mw-ui-progressive', () => {
				overlay.closeHandler();
				managerOverlay.closeHandler();
				location.reload();
			});
			if (errorCount > 0) {
				addFooterBtn(footerRight2, 'Close without reload', 'mw-ui-quiet', () => {
					overlay.closeHandler();
					cancelBtnOuter.disabled = false;
					archiveBtn.disabled = selected.filter(it => it.selected)
						.length === 0;
				});
			}
		});
	}

	// ============================================================================
	// [SECTION 15] SINGLE-THREAD ARCHIVE DIALOG
	// Handles the interface and functionality for archiving individual sections.
	// ============================================================================
	async function onArchiveBtnClick(thread, btn) {
		btn.disabled = true;
		btn.innerHTML = '<span class="ta-btn-spinner"></span>';

		const {
			overlay,
			body,
			footer
		} = createDialog({
			title: 'Archive section',
			icon: '🗃️',
			small: true,
			onClose: () => {
				btn.disabled = false;
				btn.textContent = '🗃️';
			}
		});

		const bodyPad = document.createElement('div');
		bodyPad.className = 'ta-dialog-body-pad';
		bodyPad.innerHTML = `
			<div style="font-weight:700;margin-bottom:6px">${mw.html.escape(thread.titleClean)}</div>
			<div class="ta-progress-log" id="ta-prog">⏳ Detecting timestamp…</div>`;
		body.appendChild(bodyPad);

		let timestamp = null;
		try {
			timestamp = await getThreadLastTimestamp(thread.content);
		} catch (e) {}

		const detectedYear = timestamp ? timestamp.getUTCFullYear() : new Date().getUTCFullYear();
		let activeYear = detectedYear;
		const tsDisplay = timestamp ? timestamp.toISOString().slice(0, 10) : 'Not detected';

		function renderSingleBody() {
			const curArchiveTitle = getArchiveTitle(activeYear);
			const isOverride = activeYear !== detectedYear;
			bodyPad.innerHTML = `
				<div style="font-weight:700;margin-bottom:8px">${mw.html.escape(thread.titleClean)}</div>
				<div>Last active: <b>${mw.html.escape(tsDisplay)}</b>
					${!timestamp ? '<span style="color:#b00"> (not detected)</span>' : ''}
				</div>
				<div class="ta-year-row">
					<label for="ta-single-year">Archive year:</label>
					<select id="ta-single-year" class="${isOverride ? 'ta-year-override' : ''}">
						${buildYearOptions(activeYear)}
					</select>
					${isOverride ? `<span style="font-size:0.82em;color:#d4730a">✏️ Manually overridden</span>` : `<span style="font-size:0.82em;color:#72777d">Auto-detected from timestamp</span>`}
				</div>
				<div class="ta-dest-preview">→ ${mw.html.escape(curArchiveTitle)}</div>
				${!timestamp ? '<div style="margin-top:8px;color:#d4730a">⚠️ Timestamp not detected. Verify the year before continuing.</div>' : ''}
				<div class="ta-progress-log" id="ta-prog2"></div>`;

			bodyPad.querySelector('#ta-single-year').addEventListener('change', e => {
				activeYear = parseInt(e.target.value, 10);
				renderSingleBody();
				attachConfirm();
			});
		}
		renderSingleBody();

		const footerRight = document.createElement('div');
		footerRight.className = 'ta-dialog-footer-right';
		footer.appendChild(footerRight);
		addFooterBtn(footerRight, 'Cancel', 'mw-ui-quiet', () => overlay.closeHandler());

		let confirmBtn;

		function attachConfirm() {
			if (confirmBtn) confirmBtn.remove();
			confirmBtn = addFooterBtn(footerRight, 'Archive', 'mw-ui-progressive', async () => {
				confirmBtn.disabled = true;
				const prog2 = bodyPad.querySelector('#ta-prog2');
				if (prog2) prog2.textContent = '⏳ Archiving…';
				const finalArchiveTitle = getArchiveTitle(activeYear);
				try {
					await archiveThread(thread, finalArchiveTitle);
					bodyPad.innerHTML =
						`
						<div>✅ Section <b>${mw.html.escape(thread.titleClean)}</b> archived successfully.</div>
						<div class="ta-dest-preview" style="margin-top:6px">→ <a href="${mw.util.getUrl(finalArchiveTitle)}" target="_blank">${mw.html.escape(finalArchiveTitle)}</a></div>`;
					footerRight.innerHTML = '';
					addFooterBtn(footerRight, 'Close & reload', 'mw-ui-progressive',
						() => {
							overlay.closeHandler();
							location.reload();
						});
				} catch (e) {
					console.error('[Kiroku Hokan-ki:Rachmat04]', e);
					const p2 = bodyPad.querySelector('#ta-prog2');
					if (p2) p2.textContent = '❌ Failed. Check the browser console.';
					confirmBtn.disabled = false;
				}
			});
		}
		attachConfirm();
	}

	// ============================================================================
	// [SECTION 16] BUTTON INJECTION
	// Hooks into the DOM to add per-heading archive buttons and the bulk manager FAB.
	// ============================================================================
	async function injectButtons() {
		let wikitext;
		try {
			const res = await api.get({
				action: 'query',
				prop: 'revisions',
				rvprop: 'content',
				titles: PAGE_NAME,
				formatversion: 2
			});
			wikitext = res.query.pages[0].revisions[0].content;
		} catch (e) {
			return;
		}
		if (!wikitext) return;

		const threads = parseThreads(wikitext);

		if (!document.getElementById('ta-fab')) {
			const fab = document.createElement('button');
			fab.id = 'ta-fab';
			fab.title = threads.length ?
				`Archive Manager (${threads.length} thread${threads.length !== 1 ? 's' : ''})` :
				'Archive Manager — no threads found';
			fab.innerHTML = threads.length ? `📦<span id="ta-fab-badge">${threads.length}</span>` :
				`📦`;
			fab.addEventListener('click', () => {
				if (!threads.length) openEmptyNotice();
				else openArchiveManager(threads);
			});
			document.body.appendChild(fab);
		}

		if (!threads.length) return;
		const headings = Array.from(document.querySelectorAll('#mw-content-text h2'));
		headings.forEach((heading, i) => {
			const thread = threads[i];
			if (!thread || heading.querySelector('.ta-btn')) return;

			const btn = document.createElement('button');
			btn.className = 'ta-btn';
			btn.textContent = '🗃️';
			btn.title = 'Archive this section';
			btn.addEventListener('click', e => {
				e.preventDefault();
				onArchiveBtnClick(thread, btn);
			});

			const editLink = heading.querySelector('.mw-editsection');
			if (editLink) heading.insertBefore(btn, editLink);
			else heading.appendChild(btn);
		});
	}

	// ============================================================================
	// [SECTION 17] ENTRY POINT
	// Initializes DOM execution sequences upon document ready state.
	// ============================================================================
	$(injectButtons);

})();
// </nowiki>
