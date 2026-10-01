// Editor content script (ContentScriptType.CodeMirrorPlugin, CodeMirror 6).
//
// Highlights typed literals/formulas inside Markdown tables and shows the
// computed result as an inline decoration right after each formula cell, so
// filling in a table (e.g. a time-tracking table) on a phone never requires
// switching to the viewer (see KONZEPT.md "Ergebnisse im Editor einblenden").
//
// Not unit tested (it needs a real CodeMirror 6 EditorView/DOM); the parsing
// and evaluation it relies on (src/core) is tested directly, and this file
// is kept as a thin adapter over that pure logic.

import { EditorSelection, Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { evaluateTable } from '../core/evaluator';
import { findTableBlocks, splitTableRow } from '../core/table';
import { DecimalSeparator, RawTable } from '../core/types';

const DEBOUNCE_MS = 150;

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function formatNowTime(): string {
	const d = new Date();
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatNowDateTime(): string {
	const d = new Date();
	return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

class ResultWidget extends WidgetType {
	constructor(private readonly text: string, private readonly isError: boolean) { super(); }

	eq(other: ResultWidget): boolean {
		return other.text === this.text && other.isError === this.isError;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = this.isError ? 'cm-ft-result cm-ft-result-error' : 'cm-ft-result';
		span.textContent = ` → ${this.text}`; // "→"
		return span;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

/** Builds decorations for every formula table found in the document. */
function buildDecorations(view: EditorView, decimalSeparator: DecimalSeparator): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	const lines: string[] = [];
	for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);

	const blocks = findTableBlocks(lines);

	for (const block of blocks) {
		const headers = splitTableRow(lines[block.headerLine]).map(c => c.text.trim());
		const rowSpans = block.bodyLines.map(li => splitTableRow(lines[li]));
		const rawRows = rowSpans.map(spans => spans.map(s => s.text));
		const table: RawTable = { headers, rows: rawRows };
		const evaluated = evaluateTable(table, { now: new Date(), decimalSeparator });

		for (let r = 0; r < block.bodyLines.length; r++) {
			const docLineNo = block.bodyLines[r] + 1; // CodeMirror lines are 1-based.
			const docLineStart = doc.line(docLineNo).from;
			const spans = rowSpans[r];
			for (let c = 0; c < spans.length; c++) {
				const cellEval = evaluated[r] && evaluated[r][c];
				if (!cellEval || cellEval.kind === 'text' || cellEval.kind === 'empty') continue;

				const span = spans[c];
				const leadingWs = span.text.length - span.text.trimStart().length;
				const trailingWs = span.text.length - span.text.trimEnd().length;
				const contentFrom = docLineStart + span.start + leadingWs;
				const contentTo = docLineStart + span.end - trailingWs;
				if (contentFrom >= contentTo) continue;

				const cls = cellEval.kind === 'formula' ? 'cm-ft-formula' : 'cm-ft-literal';
				builder.add(contentFrom, contentTo, Decoration.mark({ class: cls }));

				if (cellEval.kind === 'formula') {
					const text = cellEval.error ?? cellEval.display;
					builder.add(contentTo, contentTo, Decoration.widget({ widget: new ResultWidget(text, !!cellEval.error), side: 1 }));
				}
			}
		}
	}

	return builder.finish();
}

function makeViewPlugin(getDecimalSeparator: () => DecimalSeparator) {
	return ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		private debounceTimer: ReturnType<typeof setTimeout> | null = null;

		constructor(view: EditorView) {
			this.decorations = buildDecorations(view, getDecimalSeparator());
		}

		update(update: ViewUpdate): void {
			if (!update.docChanged && !update.viewportChanged) return;
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			const view = update.view;
			this.debounceTimer = setTimeout(() => {
				this.decorations = buildDecorations(view, getDecimalSeparator());
				// Force CodeMirror to pick up the recomputed decorations.
				view.dispatch({});
			}, DEBOUNCE_MS);
		}
	}, {
		decorations: v => v.decorations,
	});
}

function insertAtCursor(view: EditorView, text: string): void {
	view.dispatch(view.state.changeByRange(range => ({
		changes: { from: range.from, to: range.to, insert: text },
		range: EditorSelection.cursor(range.from + text.length),
	})));
	view.focus();
}

interface CodeMirrorControl {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM6 EditorView, injected by the host at runtime
	editor: any;
	addExtension(extension: Extension | Extension[]): void;
	registerCommand(name: string, callback: (...args: unknown[]) => unknown): void;
}

interface ContentScriptContext {
	contentScriptId: string;
	postMessage: (message: unknown) => Promise<unknown>;
}

export default function(context: ContentScriptContext) {
	// Default before the async settings round-trip resolves.
	let decimalSeparator: DecimalSeparator = ',';
	context.postMessage('getSettings').then((settings) => {
		const s = settings as { decimalSeparator?: DecimalSeparator };
		if (s && (s.decimalSeparator === ',' || s.decimalSeparator === '.')) decimalSeparator = s.decimalSeparator;
	}).catch(() => { /* keep default */ });

	return {
		plugin: (codeMirrorWrapper: CodeMirrorControl) => {
			codeMirrorWrapper.addExtension([
				makeViewPlugin(() => decimalSeparator),
				EditorView.baseTheme({
					'.cm-ft-literal': { color: 'var(--joplin-color3, #2d6cdf)' },
					'.cm-ft-formula': { color: 'var(--joplin-color3, #2d6cdf)', fontStyle: 'italic' },
					'.cm-ft-result': { opacity: '0.7', fontStyle: 'italic' },
					'.cm-ft-result-error': { color: '#c0392b', opacity: '1', fontWeight: 'bold' },
				}),
			]);

			codeMirrorWrapper.registerCommand('formulaTables.insertNow', () => {
				insertAtCursor(codeMirrorWrapper.editor, `time{${formatNowTime()}}`);
			});

			codeMirrorWrapper.registerCommand('formulaTables.insertNowDate', () => {
				insertAtCursor(codeMirrorWrapper.editor, `date{${formatNowDateTime()}}`);
			});
		},
		assets: () => [{ name: './assets/codeMirror.css' }],
	};
}
