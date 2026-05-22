/**
 * [TALKARCHIVER — RACHMAT04 — GLOBAL JS (meta.wikimedia.org)]
 *
 * •==============================================•
 * > Type     : JavaScript (MediaWiki Global JS)
 * > Install  : meta.wikimedia.org — Special:MyPage/global.js
 * > Function : "Archive now" button per thread (level-2 heading) +
 *              Floating "Archive Manager" panel for bulk archiving.
 * > Access   : Rachmat04 account only
 * > Archive  : User_talk:Rachmat04/Archives/[year]
 *              (Uses "Arsip" subpage for Indonesian/regional wikis;
 *               other wikis use "Archives")
 * > Timestamp: Read directly from signature patterns in thread text —
 *              no diff API needed, works across languages.
 * •==============================================•
 */
// <nowiki>
( function () {
	'use strict';

	/* ── 0. Guard: Rachmat04 only ─────────────────────────────────── */
	const cfg     = mw.config.get();
	const curUser = cfg.wgUserName;
	if ( curUser !== 'Rachmat04' ) return;

	/* ── 1. Guard: User talk:Rachmat04 only ──────────────────────── */
	if ( cfg.wgNamespaceNumber !== 3 ) return;
	if ( cfg.wgTitle !== 'Rachmat04' ) return;
	if (
		cfg.wgAction === 'history' ||
		cfg.wgDiffNewId ||
		cfg.wgDiffOldId ||
		cfg.wgCurRevisionId !== cfg.wgRevisionId
	) return;

	const api       = new mw.Api();
	const PAGE_NAME = cfg.wgPageName;

	/* ── 2. Archive subpage name based on subdomain ───────────────── */
	function getArchiveSubpage() {
		const subdomain = window.location.hostname.split( '.' )[ 0 ];
		const ARSIP_WIKIS = new Set( [
			'id', 'ace', 'ban', 'bjn', 'map-bms', 'bbc', 'bew',
			'bug', 'gor', 'jv', 'kge', 'mad', 'btm', 'min', 'nia', 'su'
		] );
		return ARSIP_WIKIS.has( subdomain ) ? 'Arsip' : 'Archives';
	}

	const ARCHIVE_SUBPAGE = getArchiveSubpage();

	/* ── 3. Strip wikilinks from a title string ───────────────────── */
	/**
	 * Converts wikilink markup to plain text:
	 *   [[User:Foo|Bar]]  →  Bar
	 *   [[User:Foo]]      →  Foo (last segment after last colon or slash)
	 *   [[Page]]          →  Page
	 * Also strips remaining < > markup tags for safety.
	 */
	function stripWikilinks( title ) {
		// [[target|label]] → label
		let out = title.replace( /\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2' );
		// [[target]] → last part of target (after last colon or slash)
		out = out.replace( /\[\[([^\]]+)\]\]/g, ( _m, target ) => {
			const parts = target.split( /[:\/]/ );
			return parts[ parts.length - 1 ].trim();
		} );
		// Strip any remaining HTML-like tags
		out = out.replace( /<[^>]+>/g, '' );
		return out.trim();
	}

	/* ── 4. CSS ───────────────────────────────────────────────────── */
	mw.util.addCSS( `
		/* Per-thread archive button (small icon) */
		.ta-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			margin-left: 8px;
			padding: 1px 5px;
			font-size: 1em;
			line-height: 1.4;
			background: none;
			border: 1px solid #a2a9b1;
			border-radius: 3px;
			cursor: pointer;
			vertical-align: middle;
			transition: background .15s, border-color .15s;
			white-space: nowrap;
			color: inherit;
		}
		.ta-btn:hover { background: #eaf0fb; border-color: #36c; }
		.ta-btn:disabled { opacity: .45; cursor: not-allowed; }

		/* Floating Archive Manager FAB */
		#ta-fab {
			position: fixed;
			bottom: 28px;
			right: 28px;
			z-index: 9999;
			width: 52px;
			height: 52px;
			border-radius: 50%;
			background: #1a4e8a;
			color: #fff;
			border: none;
			font-size: 1.5em;
			cursor: pointer;
			box-shadow: 0 4px 16px rgba(0,0,0,.32);
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background .15s, transform .1s;
		}
		#ta-fab:hover { background: #153d6e; transform: scale(1.07); }
		#ta-fab-badge {
			position: absolute;
			top: -4px;
			right: -4px;
			background: #d33;
			color: #fff;
			border-radius: 50%;
			width: 20px;
			height: 20px;
			font-size: 0.6em;
			font-weight: 700;
			display: flex;
			align-items: center;
			justify-content: center;
			pointer-events: none;
		}

		/* Spinner */
		.ta-btn-spinner {
			display: inline-block;
			width: 10px; height: 10px;
			border: 2px solid rgba(255,255,255,.4);
			border-top-color: #fff;
			border-radius: 50%;
			animation: ta-spin .6s linear infinite;
		}
		@keyframes ta-spin { to { transform: rotate(360deg); } }

		/* Overlay & dialog base */
		.ta-overlay {
			position: fixed;
			inset: 0;
			background: rgba(0,0,0,.52);
			z-index: 100000;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 12px;
			animation: ta-fadein .15s ease-out;
		}
		.ta-dialog {
			background: #fff;
			color: #202122;
			border: 1px solid #a2a9b1;
			border-radius: 8px;
			width: min(820px, 96%);
			max-height: 88vh;
			display: flex;
			flex-direction: column;
			box-shadow: 0 8px 28px rgba(0,0,0,.35);
			font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
			font-size: 0.94em;
			animation: ta-slidein .15s ease-out;
			overflow: hidden;
		}
		.ta-dialog-header {
			padding: 11px 16px;
			background: #f8f9fa;
			border-bottom: 1px solid #eaecf0;
			font-weight: 700;
			font-size: 1.05em;
			display: flex;
			align-items: center;
			justify-content: space-between;
			flex-shrink: 0;
		}
		.ta-dialog-header-left { display: flex; align-items: center; gap: 7px; }
		.ta-dialog-close {
			background: none; border: none;
			font-size: 1.2em; cursor: pointer;
			color: #54595d; padding: 0 2px;
			line-height: 1;
		}
		.ta-dialog-close:hover { color: #000; }
		.ta-dialog-body {
			padding: 0;
			overflow-y: auto;
			flex: 1;
		}
		.ta-dialog-footer {
			padding: 10px 14px;
			background: #f8f9fa;
			border-top: 1px solid #eaecf0;
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 8px;
			flex-shrink: 0;
		}
		.ta-dialog-footer-right { display: flex; gap: 7px; }

		/* Small dialog variant */
		.ta-dialog-sm { width: min(520px, 96%); }

		/* Toolbar inside panel */
		.ta-toolbar {
			padding: 9px 14px;
			background: #f0f2f5;
			border-bottom: 1px solid #eaecf0;
			display: flex;
			align-items: center;
			gap: 10px;
			flex-wrap: wrap;
		}
		.ta-toolbar label {
			display: flex; align-items: center; gap: 5px;
			font-size: 0.87em; font-weight: 600; cursor: pointer;
		}
		.ta-filter-age {
			margin-left: auto;
			display: flex; align-items: center; gap: 6px;
			font-size: 0.85em;
		}
		.ta-filter-age select {
			padding: 2px 6px;
			border: 1px solid #a2a9b1;
			border-radius: 3px;
			font-size: 0.95em;
		}

		/* Thread table */
		.ta-thread-table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.88em;
		}
		.ta-thread-table th {
			padding: 7px 12px;
			background: #f8f9fa;
			border-bottom: 2px solid #eaecf0;
			text-align: left;
			font-weight: 600;
			white-space: nowrap;
			position: sticky;
			top: 0;
			z-index: 1;
		}
		.ta-thread-table td {
			padding: 8px 12px;
			border-bottom: 1px solid #eaecf0;
			vertical-align: middle;
		}
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

		/* Year select — table column */
		.ta-year-sel {
			padding: 2px 4px;
			border: 1px solid #a2a9b1;
			border-radius: 3px;
			font-size: 0.9em;
			width: 70px;
			cursor: pointer;
			background: #fff;
			color: #202122;
		}
		.ta-year-sel.ta-year-override {
			border-color: #d4730a;
			background: #fff8ee;
			color: #7a3a00;
			font-weight: 700;
		}

		/* Year picker in single-thread dialog */
		.ta-year-row {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-top: 8px;
			font-size: 0.88em;
		}
		.ta-year-row label { color: #54595d; white-space: nowrap; }
		.ta-year-row select {
			padding: 3px 6px;
			border: 1px solid #a2a9b1;
			border-radius: 3px;
			font-size: 1em;
			cursor: pointer;
		}
		.ta-year-row select.ta-year-override {
			border-color: #d4730a;
			background: #fff8ee;
			color: #7a3a00;
			font-weight: 700;
		}
		.ta-dest-preview {
			color: #3366cc;
			font-size: 0.87em;
			word-break: break-all;
			margin-top: 4px;
		}

		/* Status badges */
		.ta-badge {
			display: inline-block;
			padding: 2px 7px;
			border-radius: 10px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.ta-badge-pending  { background: #eaf0fb; color: #2a55a8; }
		.ta-badge-loading  { background: #fef6e4; color: #705000; }
		.ta-badge-ok       { background: #d5f5e3; color: #1a6b3a; }
		.ta-badge-error    { background: #fde8e8; color: #b00; }
		.ta-badge-skipped  { background: #f0f0f0; color: #555; }

		/* Footer info text */
		.ta-footer-info { font-size: 0.83em; color: #54595d; }

		/* Bulk confirm list */
		.ta-confirm-list {
			margin: 8px 0 0;
			padding: 0;
			list-style: none;
			max-height: 200px;
			overflow-y: auto;
			border: 1px solid #eaecf0;
			border-radius: 4px;
		}
		.ta-confirm-list li {
			padding: 6px 10px;
			border-bottom: 1px solid #eaecf0;
			font-size: 0.87em;
		}
		.ta-confirm-list li:last-child { border-bottom: none; }
		.ta-confirm-list .ta-dest { color: #3366cc; font-size: 0.82em; }

		/* Body padding helper */
		.ta-dialog-body-pad { padding: 14px 16px; }
		.ta-progress-log {
			margin-top: 10px;
			font-size: 0.85em;
			color: #54595d;
			min-height: 1.5em;
		}

		/* Animations */
		@keyframes ta-fadein  { from { opacity:0 } to { opacity:1 } }
		@keyframes ta-slidein {
			from { opacity:0; transform:translateY(-8px) }
			to   { opacity:1; transform:translateY(0) }
		}

		/* Dark mode */
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
	` );

	/* ── 5. Overlay stack — tracks open dialogs for Esc-to-close ──── */
	const overlayStack = [];

	document.addEventListener( 'keydown', e => {
		if ( e.key !== 'Escape' ) return;
		const top = overlayStack[ overlayStack.length - 1 ];
		if ( !top ) return;
		top.closeHandler();
	} );

	/* ── 6. Dialog utilities ──────────────────────────────────────── */
	function createOverlay() {
		const overlay = document.createElement( 'div' );
		overlay.className = 'ta-overlay';
		document.body.appendChild( overlay );

		// Register a close handler — replaced by createDialog with onClose support
		overlay.closeHandler = () => {
			overlay.remove();
			const idx = overlayStack.indexOf( overlay );
			if ( idx !== -1 ) overlayStack.splice( idx, 1 );
		};

		overlayStack.push( overlay );
		return overlay;
	}

	function createDialog( opts ) {
		// opts: { title, icon, small, onClose }
		const overlay = createOverlay();

		// Override closeHandler to support onClose callback
		overlay.closeHandler = () => {
			overlay.remove();
			const idx = overlayStack.indexOf( overlay );
			if ( idx !== -1 ) overlayStack.splice( idx, 1 );
			if ( opts.onClose ) opts.onClose();
		};

		const dialog = document.createElement( 'div' );
		dialog.className = 'ta-dialog' + ( opts.small ? ' ta-dialog-sm' : '' );

		const header = document.createElement( 'div' );
		header.className = 'ta-dialog-header';
		header.innerHTML = `<div class="ta-dialog-header-left">${opts.icon || '📦'} ${mw.html.escape( opts.title )}</div>`;

		const closeBtn = document.createElement( 'button' );
		closeBtn.className = 'ta-dialog-close';
		closeBtn.textContent = '✕';
		closeBtn.title = 'Close';
		closeBtn.addEventListener( 'click', () => overlay.closeHandler() );
		header.appendChild( closeBtn );

		const body   = document.createElement( 'div' );
		body.className = 'ta-dialog-body';

		const footer = document.createElement( 'div' );
		footer.className = 'ta-dialog-footer';

		dialog.appendChild( header );
		dialog.appendChild( body );
		dialog.appendChild( footer );
		overlay.appendChild( dialog );

		overlay.addEventListener( 'click', e => {
			if ( e.target === overlay ) overlay.closeHandler();
		} );

		return { overlay, dialog, header, body, footer };
	}

	function addFooterBtn( container, label, cls, onClick ) {
		const b = document.createElement( 'button' );
		b.className   = `mw-ui-button ${cls}`;
		b.textContent = label;
		b.addEventListener( 'click', onClick );
		container.appendChild( b );
		return b;
	}

	/* ── 7. Parse level-2 threads ────────────────────────────────── */
	function parseThreads( wikitext ) {
		const re  = /^==\s*([^=\n][^\n]*?)\s*==\s*$/gm;
		const pos = [];
		let m;
		while ( ( m = re.exec( wikitext ) ) !== null ) {
			pos.push( { title: m[ 1 ].trim(), start: m.index } );
		}
		pos.push( { title: null, start: wikitext.length } );

		return pos.slice( 0, -1 ).map( ( p, i ) => ( {
			title:       p.title,
			titleClean:  stripWikilinks( p.title ),
			content:     wikitext.substring( p.start, pos[ i + 1 ].start ),
			start:       p.start,
			end:         pos[ i + 1 ].start
		} ) );
	}

	/* ── 8. Get last timestamp from thread signatures ────────────── */
	/**
	 * Reads timestamps from wikitext signature patterns.
	 * No API calls — fast and language-agnostic.
	 *
	 * Supported patterns:
	 *   1. ISO-like  : 2019-08-21T09:32:00Z  or  2019-08-21 09.32
	 *   2. MediaWiki : HH:MM, DD Month YYYY  (en, id, gor, jv, su, etc.)
	 *
	 * Returns the most recent Date found, or null if none matched.
	 */
	async function getThreadLastTimestamp( threadContent ) {
		const RE_ISO   = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\b/g;
		const RE_MWSIG = /\b(\d{1,2})\s+\w+\s+(\d{4})\b/g;

		const dates = [];
		let m;

		while ( ( m = RE_ISO.exec( threadContent ) ) !== null ) {
			const d = new Date( m[ 1 ] );
			if ( !isNaN( d ) ) dates.push( d );
		}

		while ( ( m = RE_MWSIG.exec( threadContent ) ) !== null ) {
			const raw  = m[ 0 ];
			const year = parseInt( m[ 2 ], 10 );
			const d    = new Date( raw );
			if ( !isNaN( d ) ) {
				dates.push( d );
			} else if ( year >= 2001 && year <= 2099 ) {
				dates.push( new Date( year, 0, 1 ) );
			}
		}

		if ( !dates.length ) return null;
		return new Date( Math.max( ...dates.map( d => d.getTime() ) ) );
	}

	/* ── 9. Archive page title helper ────────────────────────────── */
	function getArchiveTitle( year ) {
		return `${PAGE_NAME.replace( /_/g, ' ' )}/${ARCHIVE_SUBPAGE}/${year}`;
	}

	/* ── 10. Build year <option> elements ─────────────────────────── */
	function buildYearOptions( selectedYear ) {
		const cur = new Date().getUTCFullYear();
		let html  = '';
		for ( let y = cur + 1; y >= cur - 20; y-- ) {
			html += `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`;
		}
		return html;
	}

	/* ── 11. Archive one or many threads — minimal saves ─────────── */
	/**
	 * archiveBatch( items, onProgress )
	 *
	 * Groups threads by destination archive page, then:
	 *   - One save per archive page
	 *   - One save to the talk page (removes all archived threads)
	 *
	 * Total edits = M archive pages + 1 talk page (not 2×N).
	 */
	async function archiveBatch( items, onProgress ) {
		const report = onProgress || function () {};
		const ok     = [];
		const errors = [];

		// Fetch talk page wikitext + baseTimestamp (once)
		report( 'Fetching talk page wikitext…' );
		const srcRes = await api.get( {
			action: 'query', prop: 'revisions',
			rvprop: [ 'content', 'timestamp' ],
			titles: PAGE_NAME, formatversion: 2
		} );
		const srcPage       = srcRes.query.pages[ 0 ];
		let   srcText       = srcPage.revisions[ 0 ].content;
		const baseTimestamp = srcPage.revisions[ 0 ].timestamp;
		const srcTitle      = PAGE_NAME.replace( /_/g, ' ' );

		// Group by destination archive page
		const byArchive = new Map();
		for ( const item of items ) {
			if ( !byArchive.has( item.archiveTitle ) ) {
				byArchive.set( item.archiveTitle, [] );
			}
			byArchive.get( item.archiveTitle ).push( item );
		}

		// For each archive page: fetch existing content, append threads, save
		for ( const [ archiveTitle, arcItems ] of byArchive ) {
			report( `Saving to ${archiveTitle}…` );
			try {
				const arcRes = await api.get( {
					action: 'query', prop: 'revisions', rvprop: 'content',
					titles: archiveTitle, formatversion: 2
				} );
				const arcPage = arcRes.query.pages[ 0 ];
				let   arcText = (
					arcPage.revisions && arcPage.revisions[ 0 ] &&
					arcPage.revisions[ 0 ].content
				) || '';

				const appended = arcItems.map( it => it.thread.content.trim() ).join( '\n\n' );
				arcText = arcText
					? `${arcText.trim()}\n\n${appended}\n`
					: `${appended}\n`;

				const archivedTitles = arcItems.map( it => `"${it.thread.title}"` ).join( ', ' );
				await api.postWithToken( 'csrf', {
					action:  'edit',
					title:   archiveTitle,
					text:    arcText.trim(),
					summary: `Archived from [[${srcTitle}]]: ${archivedTitles}`
				} );

				arcItems.forEach( it => ok.push( it.thread.title ) );
			} catch ( err ) {
				console.error( '[TalkArchiver:Rachmat04] archive page error', err );
				arcItems.forEach( it => errors.push( { title: it.thread.title, err } ) );
			}
		}

		// Remove successfully archived threads from talk page
		const okSet = new Set( ok );
		for ( const item of items ) {
			if ( !okSet.has( item.thread.title ) ) continue;
			const escaped = item.thread.content.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
			srcText = srcText.replace( new RegExp( escaped ), '' );
		}
		srcText = srcText.replace( /\n{3,}/g, '\n\n' ).trim();

		// Save talk page once
		if ( ok.length > 0 ) {
			report( 'Saving talk page…' );
			const archivedList = ok.map( t => `"${t}"` ).join( ', ' );
			await api.postWithToken( 'csrf', {
				action:        'edit',
				title:         PAGE_NAME,
				text:          srcText,
				summary:       `Archived ${ok.length} section(s): ${archivedList}`,
				basetimestamp: baseTimestamp
			} );
		}

		return { ok, errors };
	}

	/** Wrapper for single-thread archiving (used by "Archive now" button). */
	async function archiveThread( thread, archiveTitle ) {
		const result = await archiveBatch(
			[ { thread, archiveTitle } ],
			() => {}
		);
		if ( result.errors.length ) throw result.errors[ 0 ].err;
	}

	/* ── 12. Archive Manager panel ───────────────────────────────── */
	async function openArchiveManager( allThreads ) {
		const items = allThreads.map( t => ( {
			thread: t,
			ts: null,
			tsLoaded: false,
			year: new Date().getUTCFullYear(),
			archiveTitle: getArchiveTitle( new Date().getUTCFullYear() ),
			status: 'pending',
			selected: false
		} ) );

		let filterDays = 0;

		const { overlay, body, footer } = createDialog( {
			title: 'Archive Manager',
			icon:  '📦',
			onClose: () => {}
		} );

		/* Toolbar */
		const toolbar = document.createElement( 'div' );
		toolbar.className = 'ta-toolbar';

		const chkAll = document.createElement( 'input' );
		chkAll.type = 'checkbox';
		chkAll.id   = 'ta-chk-all';
		const lblAll = document.createElement( 'label' );
		lblAll.htmlFor = 'ta-chk-all';
		lblAll.appendChild( chkAll );
		lblAll.appendChild( document.createTextNode( ' Select all' ) );

		const loadTsBtn = document.createElement( 'button' );
		loadTsBtn.className = 'mw-ui-button mw-ui-quiet';
		loadTsBtn.style.fontSize = '0.85em';
		loadTsBtn.textContent = '🕐 Load timestamps';

		const filterWrap = document.createElement( 'div' );
		filterWrap.className = 'ta-filter-age';
		filterWrap.innerHTML = `<span>Filter:</span>
			<select id="ta-filter-sel">
				<option value="0">All threads</option>
				<option value="30">Older than 30 days</option>
				<option value="60">Older than 60 days</option>
				<option value="90">Older than 90 days</option>
				<option value="180">Older than 180 days</option>
			</select>`;

		toolbar.appendChild( lblAll );
		toolbar.appendChild( loadTsBtn );
		toolbar.appendChild( filterWrap );
		body.appendChild( toolbar );

		/* Table */
		const tableWrap = document.createElement( 'div' );
		const table = document.createElement( 'table' );
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
		const tbody = document.createElement( 'tbody' );
		table.appendChild( tbody );
		tableWrap.appendChild( table );
		body.appendChild( tableWrap );

		/* Footer */
		const footerInfo = document.createElement( 'div' );
		footerInfo.className = 'ta-footer-info';
		footerInfo.id = 'ta-footer-info';
		footerInfo.textContent = '0 threads selected';

		const footerRight = document.createElement( 'div' );
		footerRight.className = 'ta-dialog-footer-right';

		const cancelBtn = document.createElement( 'button' );
		cancelBtn.className = 'mw-ui-button mw-ui-quiet';
		cancelBtn.textContent = 'Close';
		cancelBtn.addEventListener( 'click', () => overlay.closeHandler() );

		const archiveBtn = document.createElement( 'button' );
		archiveBtn.className = 'mw-ui-button mw-ui-progressive';
		archiveBtn.textContent = 'Archive selected';
		archiveBtn.disabled = true;

		footerRight.appendChild( cancelBtn );
		footerRight.appendChild( archiveBtn );
		footer.appendChild( footerInfo );
		footer.appendChild( footerRight );

		/* Helpers */
		function getVisibleItems() {
			if ( filterDays === 0 ) return items;
			const cutoff = Date.now() - filterDays * 864e5;
			return items.filter( it =>
				!it.tsLoaded || ( it.ts && it.ts.getTime() < cutoff )
			);
		}

		function renderBadge( status ) {
			const map = {
				pending: [ 'ta-badge-pending', '—' ],
				loading: [ 'ta-badge-loading', '⏳' ],
				ok:      [ 'ta-badge-ok',      '✅ Done' ],
				error:   [ 'ta-badge-error',   '❌ Failed' ],
				skipped: [ 'ta-badge-skipped', 'Skipped' ]
			};
			const [ cls, txt ] = map[ status ] || map.pending;
			return `<span class="ta-badge ${cls}">${txt}</span>`;
		}

		function updateFooterCount() {
			const n = items.filter( it => it.selected ).length;
			const el = document.getElementById( 'ta-footer-info' );
			if ( el ) el.textContent = `${n} thread${n !== 1 ? 's' : ''} selected`;
			archiveBtn.disabled = n === 0;
		}

		function renderTable() {
			tbody.innerHTML = '';
			const visible = getVisibleItems();

			if ( !visible.length ) {
				const tr = document.createElement( 'tr' );
				tr.innerHTML = `<td colspan="6" style="text-align:center;padding:18px;color:#72777d">
					No threads match the current filter.</td>`;
				tbody.appendChild( tr );
				return;
			}

			visible.forEach( ( item, vi ) => {
				const tr = document.createElement( 'tr' );
				if ( item.selected ) tr.classList.add( 'ta-selected' );

				const tsText = item.tsLoaded
					? ( item.ts ? item.ts.toISOString().slice( 0, 10 ) : 'Not detected' )
					: '<span style="color:#a2a9b1">Not loaded</span>';

				const detectedYear = item.ts ? item.ts.getUTCFullYear() : new Date().getUTCFullYear();
				const isOverride   = item.yearOverride && item.yearOverride !== detectedYear;
				const yearSelCls   = isOverride ? 'ta-year-sel ta-year-override' : 'ta-year-sel';

				// Use stripped title for display
				const displayTitle = mw.html.escape( item.thread.titleClean );

				tr.innerHTML = `
					<td class="ta-td-check"><input type="checkbox" class="ta-row-chk" data-vi="${vi}" ${item.selected ? 'checked' : ''}></td>
					<td class="ta-td-title">${displayTitle}</td>
					<td class="ta-td-ts">${tsText}</td>
					<td class="ta-td-year"><select class="${yearSelCls} ta-row-year" title="Override archive year">${buildYearOptions( item.year )}</select></td>
					<td class="ta-td-dest ta-row-dest">${mw.html.escape( item.archiveTitle )}</td>
					<td class="ta-td-status">${renderBadge( item.status )}</td>`;

				tr.querySelector( '.ta-row-chk' ).addEventListener( 'change', e => {
					item.selected = e.target.checked;
					tr.classList.toggle( 'ta-selected', item.selected );
					updateFooterCount();
					const vis = getVisibleItems();
					chkAll.checked = vis.length > 0 && vis.every( it => it.selected );
					chkAll.indeterminate = vis.some( it => it.selected ) && !vis.every( it => it.selected );
				} );

				tr.querySelector( '.ta-row-year' ).addEventListener( 'change', e => {
					const newYear = parseInt( e.target.value, 10 );
					item.year         = newYear;
					item.archiveTitle = getArchiveTitle( newYear );
					item.yearOverride = newYear;
					tr.querySelector( '.ta-row-dest' ).textContent = item.archiveTitle;
					const sel = e.target;
					const det = item.ts ? item.ts.getUTCFullYear() : new Date().getUTCFullYear();
					sel.className = ( newYear !== det )
						? 'ta-year-sel ta-year-override ta-row-year'
						: 'ta-year-sel ta-row-year';
				} );

				tbody.appendChild( tr );
			} );

			updateFooterCount();
		}

		/* "Select all" checkbox */
		chkAll.addEventListener( 'change', () => {
			const vis = getVisibleItems();
			vis.forEach( it => { it.selected = chkAll.checked; } );
			renderTable();
		} );

		/* Filter select — attach after DOM insertion */
		setTimeout( () => {
			const sel = document.getElementById( 'ta-filter-sel' );
			if ( sel ) sel.addEventListener( 'change', e => {
				filterDays = parseInt( e.target.value, 10 );
				chkAll.checked = false;
				renderTable();
			} );
		}, 0 );

		/* Load timestamps — re-clickable to refresh */
		loadTsBtn.addEventListener( 'click', async () => {
			loadTsBtn.disabled = true;
			loadTsBtn.textContent = '⏳ Loading…';

			for ( let i = 0; i < items.length; i++ ) {
				items[ i ].status = 'loading';
				renderTable();

				const ts = await getThreadLastTimestamp( items[ i ].thread.content );
				items[ i ].ts       = ts;
				items[ i ].tsLoaded = true;
				// Only update year if user hasn't manually overridden it
				if ( !items[ i ].yearOverride ) {
					items[ i ].year         = ts ? ts.getUTCFullYear() : new Date().getUTCFullYear();
					items[ i ].archiveTitle = getArchiveTitle( items[ i ].year );
				}
				items[ i ].status = 'pending';
				renderTable();
			}

			loadTsBtn.disabled = false;
			loadTsBtn.textContent = '🔄 Refresh timestamps';
		} );

		/* Archive button */
		archiveBtn.addEventListener( 'click', () => {
			const selected = items.filter( it => it.selected );
			if ( !selected.length ) return;
			openBulkConfirm( selected, items, overlay, renderTable, updateFooterCount, archiveBtn, cancelBtn );
		} );

		renderTable();
	}

	/* ── 13. Bulk confirm dialog ─────────────────────────────────── */
	function openBulkConfirm( selected, allItems, managerOverlay, renderTable, updateFooterCount, archiveBtn, cancelBtnOuter ) {
		const { overlay, body, footer } = createDialog( {
			title: `Confirm archiving ${selected.length} thread${selected.length !== 1 ? 's' : ''}`,
			icon:  '📋',
			small: true
		} );

		const bodyPad = document.createElement( 'div' );
		bodyPad.className = 'ta-dialog-body-pad';
		bodyPad.innerHTML = `<p style="margin:0 0 6px">The following threads will be archived:</p>`;

		const ul = document.createElement( 'ul' );
		ul.className = 'ta-confirm-list';
		selected.forEach( item => {
			const li = document.createElement( 'li' );
			li.innerHTML = `<b>${mw.html.escape( item.thread.titleClean )}</b>
				<div class="ta-dest">→ ${mw.html.escape( item.archiveTitle )}</div>`;
			ul.appendChild( li );
		} );
		bodyPad.appendChild( ul );

		const progressLog = document.createElement( 'div' );
		progressLog.className = 'ta-progress-log';
		progressLog.id = 'ta-bulk-progress';
		bodyPad.appendChild( progressLog );
		body.appendChild( bodyPad );

		const footerRight2 = document.createElement( 'div' );
		footerRight2.className = 'ta-dialog-footer-right';
		footer.appendChild( footerRight2 );

		const c2 = addFooterBtn( footerRight2, 'Cancel', 'mw-ui-quiet', () => overlay.closeHandler() );
		const confirmBtn = addFooterBtn( footerRight2, 'Archive now', 'mw-ui-progressive', async () => {
			confirmBtn.disabled = true;
			c2.disabled = true;
			archiveBtn.disabled = true;
			cancelBtnOuter.disabled = true;

			const progEl = document.getElementById( 'ta-bulk-progress' );

			selected.forEach( it => { it.status = 'loading'; } );
			renderTable();

			let batchResult;
			try {
				batchResult = await archiveBatch(
					selected.map( it => ( { thread: it.thread, archiveTitle: it.archiveTitle } ) ),
					msg => { if ( progEl ) progEl.textContent = `⏳ ${msg}`; }
				);
			} catch ( fatalErr ) {
				console.error( '[TalkArchiver:Rachmat04] fatal batch error', fatalErr );
				batchResult = {
					ok: [],
					errors: selected.map( it => ( { title: it.thread.title, err: fatalErr } ) )
				};
			}

			const okSet = new Set( batchResult.ok );
			selected.forEach( it => {
				it.status   = okSet.has( it.thread.title ) ? 'ok' : 'error';
				it.selected = false;
			} );
			renderTable();
			updateFooterCount();

			const doneCount  = batchResult.ok.length;
			const errorCount = batchResult.errors.length;
			if ( progEl ) progEl.innerHTML =
				`<b>Done.</b> ${doneCount} succeeded, ${errorCount} failed.` +
				( errorCount ? ' Check the browser console for details.' : '' );

			footerRight2.innerHTML = '';
			addFooterBtn( footerRight2, 'Close & reload', 'mw-ui-progressive', () => {
				overlay.closeHandler();
				managerOverlay.closeHandler();
				location.reload();
			} );
			if ( errorCount > 0 ) {
				addFooterBtn( footerRight2, 'Close without reload', 'mw-ui-quiet', () => {
					overlay.closeHandler();
					cancelBtnOuter.disabled = false;
					archiveBtn.disabled = selected.filter( it => it.selected ).length === 0;
				} );
			}
		} );
	}

	/* ── 14. Single-thread "Archive now" button handler ──────────── */
	async function onArchiveBtnClick( thread, btn ) {
		btn.disabled = true;
		btn.innerHTML = '<span class="ta-btn-spinner"></span>';

		const { overlay, body, footer } = createDialog( {
			title: 'Archive section',
			icon:  '🗃️',
			small: true,
			onClose: () => { btn.disabled = false; btn.textContent = '🗃️'; }
		} );

		const bodyPad = document.createElement( 'div' );
		bodyPad.className = 'ta-dialog-body-pad';
		bodyPad.innerHTML = `
			<div style="font-weight:700;margin-bottom:6px">${mw.html.escape( thread.titleClean )}</div>
			<div class="ta-progress-log" id="ta-prog">⏳ Detecting timestamp…</div>`;
		body.appendChild( bodyPad );

		let timestamp = null;
		try {
			timestamp = await getThreadLastTimestamp( thread.content );
		} catch ( e ) {}

		const detectedYear = timestamp ? timestamp.getUTCFullYear() : new Date().getUTCFullYear();
		let   activeYear   = detectedYear;
		const tsDisplay    = timestamp ? timestamp.toISOString().slice( 0, 10 ) : 'Not detected';

		function renderSingleBody() {
			const curArchiveTitle = getArchiveTitle( activeYear );
			const isOverride      = activeYear !== detectedYear;

			bodyPad.innerHTML = `
				<div style="font-weight:700;margin-bottom:8px">${mw.html.escape( thread.titleClean )}</div>
				<div>Last active: <b>${mw.html.escape( tsDisplay )}</b>
					${!timestamp ? '<span style="color:#b00"> (not detected)</span>' : ''}
				</div>
				<div class="ta-year-row">
					<label for="ta-single-year">Archive year:</label>
					<select id="ta-single-year" class="${isOverride ? 'ta-year-override' : ''}">
						${buildYearOptions( activeYear )}
					</select>
					${isOverride
						? `<span style="font-size:0.82em;color:#d4730a">✏️ Manually overridden</span>`
						: `<span style="font-size:0.82em;color:#72777d">Auto-detected from timestamp</span>`
					}
				</div>
				<div class="ta-dest-preview">→ ${mw.html.escape( curArchiveTitle )}</div>
				${!timestamp ? '<div style="margin-top:8px;color:#d4730a">⚠️ Timestamp not detected. Verify the year before continuing.</div>' : ''}
				<div class="ta-progress-log" id="ta-prog2"></div>`;

			bodyPad.querySelector( '#ta-single-year' ).addEventListener( 'change', e => {
				activeYear = parseInt( e.target.value, 10 );
				renderSingleBody();
				attachConfirm();
			} );
		}

		renderSingleBody();

		const footerRight = document.createElement( 'div' );
		footerRight.className = 'ta-dialog-footer-right';
		footer.appendChild( footerRight );

		addFooterBtn( footerRight, 'Cancel', 'mw-ui-quiet', () => overlay.closeHandler() );

		let confirmBtn;
		function attachConfirm() {
			if ( confirmBtn ) confirmBtn.remove();
			confirmBtn = addFooterBtn( footerRight, 'Archive', 'mw-ui-progressive', async () => {
				confirmBtn.disabled = true;
				const prog2 = bodyPad.querySelector( '#ta-prog2' );
				if ( prog2 ) prog2.textContent = '⏳ Archiving…';
				const finalArchiveTitle = getArchiveTitle( activeYear );
				try {
					await archiveThread( thread, finalArchiveTitle );
					bodyPad.innerHTML = `
						<div>✅ Section <b>${mw.html.escape( thread.titleClean )}</b> archived successfully.</div>
						<div class="ta-dest-preview" style="margin-top:6px">→ <a href="${mw.util.getUrl( finalArchiveTitle )}" target="_blank">${mw.html.escape( finalArchiveTitle )}</a></div>`;
					footerRight.innerHTML = '';
					addFooterBtn( footerRight, 'Close & reload', 'mw-ui-progressive', () => {
						overlay.closeHandler();
						location.reload();
					} );
				} catch ( e ) {
					console.error( '[TalkArchiver:Rachmat04]', e );
					const p2 = bodyPad.querySelector( '#ta-prog2' );
					if ( p2 ) p2.textContent = '❌ Failed. Check the browser console.';
					confirmBtn.disabled = false;
				}
			} );
		}
		attachConfirm();
	}

	/* ── 15. Inject buttons ───────────────────────────────────────── */
	async function injectButtons() {
		let wikitext;
		try {
			const res = await api.get( {
				action: 'query', prop: 'revisions', rvprop: 'content',
				titles: PAGE_NAME, formatversion: 2
			} );
			wikitext = res.query.pages[ 0 ].revisions[ 0 ].content;
		} catch ( e ) { return; }
		if ( !wikitext ) return;

		const threads = parseThreads( wikitext );
		if ( !threads.length ) return;

		/* Floating Archive Manager button (FAB) */
		if ( !document.getElementById( 'ta-fab' ) ) {
			const fab = document.createElement( 'button' );
			fab.id        = 'ta-fab';
			fab.title     = `Archive Manager (${threads.length} thread${threads.length !== 1 ? 's' : ''})`;
			fab.innerHTML = `📦<span id="ta-fab-badge">${threads.length}</span>`;
			fab.addEventListener( 'click', () => openArchiveManager( threads ) );
			document.body.appendChild( fab );
		}

		/* Small "Archive now" icon button per heading */
		const headings = Array.from( document.querySelectorAll( '#mw-content-text h2' ) );
		headings.forEach( ( heading, i ) => {
			const thread = threads[ i ];
			if ( !thread ) return;
			if ( heading.querySelector( '.ta-btn' ) ) return;

			const btn = document.createElement( 'button' );
			btn.className   = 'ta-btn';
			btn.textContent = '🗃️';
			btn.title       = `Archive this section`;
			btn.addEventListener( 'click', e => {
				e.preventDefault();
				onArchiveBtnClick( thread, btn );
			} );

			const editLink = heading.querySelector( '.mw-editsection' );
			if ( editLink ) heading.insertBefore( btn, editLink );
			else heading.appendChild( btn );
		} );
	}

	/* ── 16. Run after DOM ready ─────────────────────────────────── */
	$( injectButtons );

} )();
// </nowiki>
