import { parseFormula, ParseError } from './parser';

describe('parseFormula', () => {
	test('operator precedence and parentheses', () => {
		const ast = parseFormula('1 + 2 * 3');
		expect(ast).toEqual({
			type: 'binop', op: '+',
			left: { type: 'number', value: 1 },
			right: { type: 'binop', op: '*', left: { type: 'number', value: 2 }, right: { type: 'number', value: 3 } },
		});
	});

	test('unary minus', () => {
		const ast = parseFormula('-A1');
		expect(ast).toEqual({ type: 'unary', op: '-', expr: { type: 'cellRef', coord: { col: 0, row: 0 } } });
	});

	test('cell ref and range', () => {
		expect(parseFormula('A1')).toEqual({ type: 'cellRef', coord: { col: 0, row: 0 } });
		expect(parseFormula('sum{B2:B9}')).toEqual({
			type: 'func', name: 'sum',
			args: [{ type: 'range', from: { col: 1, row: 1 }, to: { col: 1, row: 8 } }],
		});
	});

	test('header ref preserves the raw header text', () => {
		expect(parseFormula('[Kommen]')).toEqual({ type: 'headerRef', header: 'Kommen' });
	});

	test('literal braces preserve exact raw content including spaces', () => {
		expect(parseFormula('date{23.09.2026 14:05}')).toEqual({ type: 'literal', litType: 'date', raw: '23.09.2026 14:05' });
	});

	test('function with multiple ; separated args', () => {
		expect(parseFormula('round{1,2345; 2}')).toEqual({
			type: 'func', name: 'round',
			args: [{ type: 'number', value: 1.2345 }, { type: 'number', value: 2 }],
		});
	});

	test('throws ParseError on invalid syntax', () => {
		expect(() => parseFormula('1 +')).toThrow(ParseError);
		expect(() => parseFormula('foo{1}')).toThrow(ParseError);
		expect(() => parseFormula('(1 + 2')).toThrow(ParseError);
	});
});
