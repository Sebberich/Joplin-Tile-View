import { formatNumber, formatValue } from './format';
import { Value } from './types';

describe('formatNumber', () => {
	test('trims trailing zeros', () => {
		expect(formatNumber(12, ',')).toBe('12');
		expect(formatNumber(1.5, ',')).toBe('1,5');
		expect(formatNumber(1.5, '.')).toBe('1.5');
		expect(formatNumber(1.0, ',')).toBe('1');
	});
});

describe('formatValue', () => {
	const fmt = (v: Value) => formatValue(v, ',');

	test('duration formats as H:MM h, negative wraps sign', () => {
		expect(fmt({ kind: 'duration', minutes: 465 })).toBe('7:45 h');
		expect(fmt({ kind: 'duration', minutes: -15 })).toBe('-0:15 h');
	});

	test('date formats DD.MM.YYYY', () => {
		expect(fmt({ kind: 'date', date: new Date(2026, 8, 23) })).toBe('23.09.2026');
	});

	test('datetime formats DD.MM.YYYY HH:MM', () => {
		expect(fmt({ kind: 'datetime', date: new Date(2026, 8, 23, 14, 5) })).toBe('23.09.2026 14:05');
	});

	test('time formats HH:MM', () => {
		expect(fmt({ kind: 'time', minutes: 8 * 60 + 12 })).toBe('08:12');
	});

	test('currency formats with 2 decimals and symbol', () => {
		expect(fmt({ kind: 'currency', currency: 'EUR', value: 12.5 })).toBe('12,50 €');
		expect(formatValue({ kind: 'currency', currency: 'USD', value: 12.5 }, '.')).toBe('12.50 $');
	});

	test('error shows its code', () => {
		expect(fmt({ kind: 'error', code: '#TYPE' })).toBe('#TYPE');
	});
});
