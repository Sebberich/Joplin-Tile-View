// Helpers for addressing table cells: spreadsheet-style column letters
// (A, B, ..., Z, AA, AB, ...) and header-name lookups.

/** Converts a 0-based column index to spreadsheet letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function indexToColLetters(index: number): string {
	let n = index + 1;
	let out = '';
	while (n > 0) {
		const rem = (n - 1) % 26;
		out = String.fromCharCode(65 + rem) + out;
		n = Math.floor((n - 1) / 26);
	}
	return out;
}

/** Converts spreadsheet column letters to a 0-based column index. Returns
 * -1 for invalid input. */
export function colLettersToIndex(letters: string): number {
	if (!/^[A-Za-z]+$/.test(letters)) return -1;
	let n = 0;
	for (const ch of letters.toUpperCase()) {
		n = n * 26 + (ch.charCodeAt(0) - 64);
	}
	return n - 1;
}

/** Finds the column index whose header text equals `name`, case-insensitive
 * and trimmed. Returns -1 if not found. */
export function findHeaderIndex(headers: string[], name: string): number {
	const target = name.trim().toLowerCase();
	return headers.findIndex(h => h.trim().toLowerCase() === target);
}

// ---------------------------------------------------------------------------
// Line-based table scanning, shared by the markdown-it and CodeMirror
// content scripts. Pure string parsing, no DOM/editor dependency, so it is
// unit-testable like the rest of src/core.
// ---------------------------------------------------------------------------

export interface TableCellSpan {
	/** Raw, untrimmed cell text (leading/trailing space is Markdown's own
	 * padding, kept so offsets line up with the source line). */
	text: string;
	/** Character offset of the cell's first character within the line. */
	start: number;
	/** Character offset just past the cell's last character within the line. */
	end: number;
}

/** Splits a Markdown table row into cells, honouring `\|` as an escaped
 * pipe (not a cell separator) and ignoring a leading/trailing empty cell
 * caused by a row written as `| a | b |`. Returns cell spans with offsets
 * into `line`, so callers can place editor decorations precisely. */
export function splitTableRow(line: string): TableCellSpan[] {
	const cells: TableCellSpan[] = [];
	let i = 0;
	const pipePositions: number[] = [];
	while (i < line.length) {
		if (line[i] === '\\' && i + 1 < line.length) { i += 2; continue; }
		if (line[i] === '|') pipePositions.push(i);
		i++;
	}
	if (pipePositions.length === 0) return [{ text: line, start: 0, end: line.length }];

	// Build cells between consecutive pipes (and the line edges).
	const splitPoints = [-1, ...pipePositions, line.length];
	for (let k = 0; k < splitPoints.length - 1; k++) {
		const start = splitPoints[k] + 1;
		const end = splitPoints[k + 1];
		if (start > end) continue;
		cells.push({ text: line.slice(start, end), start, end });
	}

	// Drop a leading/trailing empty cell that results from a row framed
	// with pipes, e.g. "| a | b |" -> ["", "a", "b", ""] -> ["a", "b"].
	if (cells.length > 1 && cells[0].text.trim() === '') cells.shift();
	if (cells.length > 1 && cells[cells.length - 1].text.trim() === '') cells.pop();
	return cells;
}

/** True if `line` is a Markdown table header-separator row, e.g.
 * `|---|:---:|---|` or `--- | ---`. */
export function isTableSeparatorLine(line: string): boolean {
	const t = line.trim();
	if (t === '') return false;
	const cells = splitTableRow(t);
	if (cells.length === 0) return false;
	return cells.every(c => /^:?-{1,}:?$/.test(c.text.trim()));
}

export interface TableBlock {
	/** 0-based index of the header line in the source lines array. */
	headerLine: number;
	/** 0-based index of the '---' separator line. */
	separatorLine: number;
	/** 0-based indices of the body rows (may be empty). */
	bodyLines: number[];
}

/** Scans an array of document lines for Markdown table blocks (a header
 * row immediately followed by a separator row, then zero or more body
 * rows). Blocks end at the first line that no longer contains a `|` or
 * that is blank. */
export function findTableBlocks(lines: string[]): TableBlock[] {
	const blocks: TableBlock[] = [];
	for (let i = 0; i < lines.length - 1; i++) {
		if (!lines[i].includes('|')) continue;
		if (!isTableSeparatorLine(lines[i + 1])) continue;
		// Found a header + separator pair.
		const headerLine = i;
		const separatorLine = i + 1;
		const bodyLines: number[] = [];
		let j = i + 2;
		while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
			bodyLines.push(j);
			j++;
		}
		blocks.push({ headerLine, separatorLine, bodyLines });
		i = j - 1; // Resume scanning after this block.
	}
	return blocks;
}
