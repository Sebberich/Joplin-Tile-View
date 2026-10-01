import { evaluateTable, parseStandaloneLiteral } from './evaluator';
import { RawTable, Value } from './types';

const NOW = new Date(2026, 8, 23, 16, 40); // 23.09.2026 16:40

// Evaluates a single formula (given the full table for context) and returns
// the formatted display string. Row/col are 0-based body coordinates.
function evalCellDisplay(table: RawTable, row: number, col: number, decimalSeparator: ',' | '.' = ','): string {
	const grid = evaluateTable(table, { now: NOW, decimalSeparator });
	return grid[row][col].display;
}

function singleFormulaTable(formula: string): RawTable {
	return { headers: ['A'], rows: [[formula]] };
}

describe('literal parsing', () => {
	test('numbers', () => {
		expect(parseStandaloneLiteral('12', NOW)).toEqual({ kind: 'number', value: 12 });
		expect(parseStandaloneLiteral('1,5', NOW)).toEqual({ kind: 'number', value: 1.5 });
		expect(parseStandaloneLiteral('1.5', NOW)).toEqual({ kind: 'number', value: 1.5 });
		expect(parseStandaloneLiteral('-3', NOW)).toEqual({ kind: 'number', value: -3 });
	});

	test('date literals', () => {
		expect(parseStandaloneLiteral('date{23.09.2026}', NOW)).toEqual({ kind: 'date', date: new Date(2026, 8, 23) });
		expect(parseStandaloneLiteral('date{23.9.26}', NOW)).toEqual({ kind: 'date', date: new Date(2026, 8, 23) });
		expect(parseStandaloneLiteral('date{23.09.}', NOW)).toEqual({ kind: 'date', date: new Date(NOW.getFullYear(), 8, 23) });
		expect(parseStandaloneLiteral('date{2026-09-23}', NOW)).toEqual({ kind: 'date', date: new Date(2026, 8, 23) });
		expect(parseStandaloneLiteral('date{23.09.2026 14:05}', NOW)).toEqual({ kind: 'datetime', date: new Date(2026, 8, 23, 14, 5) });
	});

	test('time-of-day vs duration', () => {
		expect(parseStandaloneLiteral('time{14:05}', NOW)).toEqual({ kind: 'time', minutes: 14 * 60 + 5 });
		expect(parseStandaloneLiteral('time{1,5h}', NOW)).toEqual({ kind: 'duration', minutes: 90 });
		expect(parseStandaloneLiteral('time{1.5h}', NOW)).toEqual({ kind: 'duration', minutes: 90 });
		expect(parseStandaloneLiteral('time{90min}', NOW)).toEqual({ kind: 'duration', minutes: 90 });
		expect(parseStandaloneLiteral('time{2h30min}', NOW)).toEqual({ kind: 'duration', minutes: 150 });
		expect(parseStandaloneLiteral('time{45m}', NOW)).toEqual({ kind: 'duration', minutes: 45 });
		expect(parseStandaloneLiteral('time{1:30h}', NOW)).toEqual({ kind: 'duration', minutes: 90 });
	});

	test('currency', () => {
		expect(parseStandaloneLiteral('eur{12,50}', NOW)).toEqual({ kind: 'currency', currency: 'EUR', value: 12.5 });
		expect(parseStandaloneLiteral('usd{12.50}', NOW)).toEqual({ kind: 'currency', currency: 'USD', value: 12.5 });
		expect(parseStandaloneLiteral('chf{5}', NOW)).toEqual({ kind: 'currency', currency: 'CHF', value: 5 });
		expect(parseStandaloneLiteral('gbp{5}', NOW)).toEqual({ kind: 'currency', currency: 'GBP', value: 5 });
	});

	test('now', () => {
		expect(parseStandaloneLiteral('now', NOW)).toEqual({ kind: 'datetime', date: NOW });
	});

	test('plain text is not a literal', () => {
		expect(parseStandaloneLiteral('hello world', NOW)).toBeNull();
		expect(parseStandaloneLiteral('', NOW)).toBeNull();
	});

	test('invalid literal content is a #SYNTAX error value, not null', () => {
		const v = parseStandaloneLiteral('date{not-a-date}', NOW) as Value;
		expect(v).toEqual({ kind: 'error', code: '#SYNTAX' });
	});
});

describe('arithmetic and type rules', () => {
	test('number + number', () => {
		expect(evalCellDisplay(singleFormulaTable('=1+2'), 0, 0)).toBe('3');
	});

	test('division by zero', () => {
		expect(evalCellDisplay(singleFormulaTable('=1/0'), 0, 0)).toBe('#DIV/0');
	});

	test('date - date -> duration (days)', () => {
		expect(evalCellDisplay(singleFormulaTable('=date{25.09.2026} - date{23.09.2026}'), 0, 0)).toBe('48:00 h');
	});

	test('datetime ± duration -> datetime', () => {
		expect(evalCellDisplay(singleFormulaTable('=date{23.09.2026 10:00} + time{90min}'), 0, 0)).toBe('23.09.2026 11:30');
	});

	test('time - time -> duration, wraps within 24h when negative', () => {
		expect(evalCellDisplay(singleFormulaTable('=time{01:00} - time{23:00}'), 0, 0)).toBe('2:00 h');
	});

	test('time ± duration -> time', () => {
		expect(evalCellDisplay(singleFormulaTable('=time{23:30} + time{1h}'), 0, 0)).toBe('00:30');
	});

	test('duration ± duration -> duration', () => {
		expect(evalCellDisplay(singleFormulaTable('=time{1h} + time{30min}'), 0, 0)).toBe('1:30 h');
	});

	test('duration * number and number * duration -> duration', () => {
		expect(evalCellDisplay(singleFormulaTable('=time{1h} * 2'), 0, 0)).toBe('2:00 h');
		expect(evalCellDisplay(singleFormulaTable('=2 * time{1h}'), 0, 0)).toBe('2:00 h');
	});

	test('duration / duration -> number', () => {
		expect(evalCellDisplay(singleFormulaTable('=time{3h} / time{1h}'), 0, 0)).toBe('3');
	});

	test('currency ± currency (same currency)', () => {
		expect(evalCellDisplay(singleFormulaTable('=eur{10} + eur{2,50}'), 0, 0)).toBe('12,50 €');
	});

	test('currency ± currency (different currency) is #TYPE', () => {
		expect(evalCellDisplay(singleFormulaTable('=eur{10} + usd{2}'), 0, 0)).toBe('#TYPE');
	});

	test('currency * number -> currency', () => {
		expect(evalCellDisplay(singleFormulaTable('=eur{12,50} * 2'), 0, 0)).toBe('25,00 €');
	});

	test('duration * currency -> currency (hourly rate)', () => {
		expect(evalCellDisplay(singleFormulaTable('=time{1,5h} * eur{12,50}'), 0, 0)).toBe('18,75 €');
	});

	test('date + currency is #TYPE (no guessing)', () => {
		expect(evalCellDisplay(singleFormulaTable('=date{23.09.2026} + eur{1}'), 0, 0)).toBe('#TYPE');
	});

	test('sqrt only on numbers', () => {
		expect(evalCellDisplay(singleFormulaTable('=sqrt{9}'), 0, 0)).toBe('3');
		expect(evalCellDisplay(singleFormulaTable('=sqrt{eur{9}}'), 0, 0)).toBe('#TYPE');
	});

	test('unknown identifier / bad syntax -> #SYNTAX', () => {
		expect(evalCellDisplay(singleFormulaTable('=1 + '), 0, 0)).toBe('#SYNTAX');
		expect(evalCellDisplay(singleFormulaTable('=foo{1}'), 0, 0)).toBe('#SYNTAX');
	});
});

describe('references', () => {
	test('A1 style reference', () => {
		const table: RawTable = { headers: ['A', 'B'], rows: [['3', '=A1*2']] };
		expect(evalCellDisplay(table, 0, 1)).toBe('6');
	});

	test('unknown reference -> #REF', () => {
		const table: RawTable = { headers: ['A'], rows: [['=A5']] };
		expect(evalCellDisplay(table, 0, 0)).toBe('#REF');
	});

	test('range A1:A3 inside sum', () => {
		const table: RawTable = { headers: ['A'], rows: [['1'], ['2'], ['3'], ['=sum{A1:A3}']] };
		expect(evalCellDisplay(table, 3, 0)).toBe('6');
	});

	test('[Header] reference resolves by header name, same row', () => {
		const table: RawTable = {
			headers: ['Tag', 'Kommen', 'Gehen', 'Dauer'],
			rows: [['date{22.09.2026}', 'time{08:12}', 'time{16:40}', '=[Gehen] - [Kommen]']],
		};
		expect(evalCellDisplay(table, 0, 3)).toBe('8:28 h');
	});

	test('[Header] lookup is case-insensitive and trimmed', () => {
		const table: RawTable = { headers: [' Kommen ', 'X'], rows: [['time{08:00}', '=[kommen]']] };
		expect(evalCellDisplay(table, 0, 1)).toBe('08:00');
	});
});

describe('aggregate functions', () => {
	const table: RawTable = { headers: ['A'], rows: [['4'], ['9'], ['text'], [''], ['=min{A1:A2}'], ['=max{A1:A2}'], ['=avg{A1:A2}']] };

	test('min/max/avg skip text and empty cells, sqrt works', () => {
		expect(evalCellDisplay(table, 4, 0)).toBe('4');
		expect(evalCellDisplay(table, 5, 0)).toBe('9');
		expect(evalCellDisplay(table, 6, 0)).toBe('6,5');
	});

	test('round{x; digits}', () => {
		expect(evalCellDisplay(singleFormulaTable('=round{1,2345; 2}'), 0, 0)).toBe('1,23');
	});

	test('sum/min/max/avg on mixed types is #TYPE', () => {
		const t: RawTable = { headers: ['A'], rows: [['1'], ['eur{1}'], ['=sum{A1:A2}']] };
		expect(evalCellDisplay(t, 2, 0)).toBe('#TYPE');
	});
});

describe('circular references', () => {
	test('direct cycle -> #CIRC', () => {
		const table: RawTable = { headers: ['A', 'B'], rows: [['=B1', '=A1']] };
		expect(evalCellDisplay(table, 0, 0)).toBe('#CIRC');
	});

	test('formulas may reference other formula cells (no cycle)', () => {
		const table: RawTable = { headers: ['A', 'B'], rows: [['2', '=A1*2'], ['', '=B1+1']] };
		expect(evalCellDisplay(table, 1, 1)).toBe('5');
	});
});

describe('Stempeluhr example (deterministic via injected now)', () => {
	test('full table from KONZEPT.md', () => {
		const table: RawTable = {
			headers: ['Tag', 'Kommen', 'Gehen', 'Dauer'],
			rows: [
				['date{22.09.2026}', 'time{08:12}', 'time{16:40}', '=[Gehen] - [Kommen]'],
				['date{23.09.2026}', 'time{08:05}', 'now', '=[Gehen] - [Kommen]'],
				['**Summe**', '', '', '=sum{D1:D2}'],
			],
		};
		const grid = evaluateTable(table, { now: NOW, decimalSeparator: ',' });
		expect(grid[0][3].display).toBe('8:28 h');
		// Row 2 "Gehen" is `now` (16:40 injected) - deterministic thanks to injected now.
		expect(grid[1][3].display).toBe('8:35 h');
		// 8:28 + 8:35 = 17:03
		expect(grid[2][3].display).toBe('17:03 h');
	});
});
