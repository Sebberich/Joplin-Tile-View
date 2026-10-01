// Renderer content script (ContentScriptType.MarkdownItPlugin).
//
// Formulas must be taken out of a cell's raw text *before* markdown-it's
// inline parser sees it (see KONZEPT.md "Formeln vor dem Markdown-Parser
// abfangen"): otherwise "=B1*C1" would read the '*' as emphasis markup and
// "[Kommen]" as the start of a link. We do this with a markdown-it *core*
// rule inserted after 'block' (tables already exist as tokens) and before
// 'inline' (cell content has not yet been tokenized as Markdown).
//
// This file has no unit tests of its own logic beyond what markdownIt.test.ts
// exercises end-to-end with a real `markdown-it` instance; the language
// semantics themselves are tested against src/core directly.

import { evaluateTable } from '../core/evaluator';
import { EvaluatedCell, RawTable } from '../core/types';

// Minimal shape of the bits of markdown-it tokens we touch, so this file
// does not need a hard dependency on the `markdown-it` package (it is
// injected by the host at runtime as the `markdownIt` plugin argument).
interface MdToken {
	type: string;
	content: string;
	children: MdToken[];
}

interface MdState {
	tokens: MdToken[];
}

interface MarkdownIt {
	core: { ruler: { after: (name: string, ruleName: string, fn: (state: MdState) => void) => void } };
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

interface TableSection {
	headerTokens: MdToken[];
	bodyTokenRows: MdToken[][];
}

/** Walks the tokens of a single table (table_open .. table_close) and
 * collects the 'inline' tokens for the header and body cells. */
function collectTableSection(tokens: MdToken[], startIndex: number, endIndex: number): TableSection {
	const headerTokens: MdToken[] = [];
	const bodyTokenRows: MdToken[][] = [];
	let inHead = false;
	let curRow: MdToken[] | null = null;

	for (let k = startIndex; k <= endIndex; k++) {
		const tok = tokens[k];
		if (tok.type === 'thead_open') inHead = true;
		else if (tok.type === 'thead_close') inHead = false;
		else if (tok.type === 'tr_open') curRow = [];
		else if (tok.type === 'tr_close') { if (!inHead && curRow) bodyTokenRows.push(curRow); curRow = null; }
		else if (tok.type === 'inline') { if (inHead) headerTokens.push(tok); else if (curRow) curRow.push(tok); }
	}

	return { headerTokens, bodyTokenRows };
}

function applyResultToToken(token: MdToken, cell: EvaluatedCell): void {
	if (cell.kind === 'text' || cell.kind === 'empty') return; // untouched, stays as normal Markdown

	if (cell.error) {
		token.content = `<span class="ft-error" title="${escapeHtml(cell.raw.trim())}">${escapeHtml(cell.error)}</span>`;
	} else if (cell.kind === 'formula') {
		token.content = `<span class="ft-result" title="${escapeHtml(cell.raw.trim())}">${escapeHtml(cell.display)}</span>`;
	} else {
		// Plain value literal (e.g. a cell that is just "date{23.09.2026}").
		token.content = escapeHtml(cell.display);
	}
	// Let the 'inline' core rule (which runs right after this one) re-parse
	// the new content as plain text/HTML instead of the original Markdown.
	// markdown-it's own 'inline' core rule passes tok.children straight to
	// inline.parse() without a null-check, so this must be [] and not null.
	token.children = [];
}

function processTable(tokens: MdToken[], startIndex: number, endIndex: number, decimalSeparator: ',' | '.'): void {
	const { headerTokens, bodyTokenRows } = collectTableSection(tokens, startIndex, endIndex);
	const headers = headerTokens.map(t => t.content);
	const rawRows = bodyTokenRows.map(row => row.map(t => t.content));

	const now = new Date();
	const hasAnything = rawRows.some(row => row.some(text => {
		const t = text.trim();
		return t.startsWith('=') || t !== '';
	}));
	if (!hasAnything) return;

	const table: RawTable = { headers, rows: rawRows };
	const evaluated = evaluateTable(table, { now, decimalSeparator });

	// Only touch cells that are formulas or recognised literals; anything
	// else (plain text, or a table with no formulas/literals at all) is
	// left completely alone.
	let touchedAny = false;
	for (let r = 0; r < bodyTokenRows.length; r++) {
		for (let c = 0; c < bodyTokenRows[r].length; c++) {
			const cell = evaluated[r] && evaluated[r][c];
			if (!cell) continue;
			if (cell.kind === 'formula' || cell.kind === 'value') {
				applyResultToToken(bodyTokenRows[r][c], cell);
				touchedAny = true;
			}
		}
	}
	void touchedAny;
}

export default function(context: { contentScriptId: string; postMessage: (msg: unknown) => Promise<unknown> }) {
	// Default before the setting round-trip resolves; matches the plugin's
	// default setting value.
	let decimalSeparator: ',' | '.' = ',';
	context.postMessage('getSettings').then((settings) => {
		const s = settings as { decimalSeparator?: ',' | '.' };
		if (s && (s.decimalSeparator === ',' || s.decimalSeparator === '.')) decimalSeparator = s.decimalSeparator;
	}).catch(() => { /* keep default */ });

	return {
		plugin: function(markdownIt: MarkdownIt) {
			markdownIt.core.ruler.after('block', 'formula_tables', (state: MdState) => {
				const tokens = state.tokens;
				let i = 0;
				while (i < tokens.length) {
					if (tokens[i].type === 'table_open') {
						let end = i + 1;
						while (end < tokens.length && tokens[end].type !== 'table_close') end++;
						processTable(tokens, i, end, decimalSeparator);
						i = end + 1;
					} else {
						i++;
					}
				}
			});
		},
		assets: function() {
			return [{ name: './assets/formulaTables.css' }];
		},
	};
}
