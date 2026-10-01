import { colLettersToIndex, findHeaderIndex, findTableBlocks, indexToColLetters, isTableSeparatorLine, splitTableRow } from './table';

describe('column letters', () => {
	test('index to letters', () => {
		expect(indexToColLetters(0)).toBe('A');
		expect(indexToColLetters(25)).toBe('Z');
		expect(indexToColLetters(26)).toBe('AA');
	});

	test('letters to index', () => {
		expect(colLettersToIndex('A')).toBe(0);
		expect(colLettersToIndex('Z')).toBe(25);
		expect(colLettersToIndex('AA')).toBe(26);
		expect(colLettersToIndex('1')).toBe(-1);
	});
});

describe('findHeaderIndex', () => {
	test('case-insensitive, trimmed match', () => {
		const headers = ['Tag', ' Kommen ', 'Gehen', 'Dauer'];
		expect(findHeaderIndex(headers, 'Kommen')).toBe(1);
		expect(findHeaderIndex(headers, 'kommen')).toBe(1);
		expect(findHeaderIndex(headers, '  GEHEN  ')).toBe(2);
		expect(findHeaderIndex(headers, 'Nope')).toBe(-1);
	});
});

describe('splitTableRow', () => {
	test('splits a standard piped row and drops the framing empty cells', () => {
		const cells = splitTableRow('| a | b | c |');
		expect(cells.map(c => c.text.trim())).toEqual(['a', 'b', 'c']);
	});

	test('honours escaped pipes', () => {
		const cells = splitTableRow('| a\\|b | c |');
		expect(cells.map(c => c.text.trim())).toEqual(['a\\|b', 'c']);
	});

	test('offsets point back into the source line', () => {
		const line = '| a | bb |';
		const cells = splitTableRow(line);
		for (const c of cells) expect(line.slice(c.start, c.end)).toBe(c.text);
	});
});

describe('isTableSeparatorLine', () => {
	test('recognises separator rows', () => {
		expect(isTableSeparatorLine('|---|---|---|')).toBe(true);
		expect(isTableSeparatorLine('--- | :---: | ---:')).toBe(true);
		expect(isTableSeparatorLine('| a | b |')).toBe(false);
	});
});

describe('findTableBlocks', () => {
	test('finds a header + separator + body block', () => {
		const lines = [
			'Some text',
			'| Tag | Kommen |',
			'|---|---|',
			'| date{22.09.2026} | time{08:12} |',
			'| date{23.09.2026} | time{08:05} |',
			'',
			'More text',
		];
		const blocks = findTableBlocks(lines);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toEqual({ headerLine: 1, separatorLine: 2, bodyLines: [3, 4] });
	});
});
