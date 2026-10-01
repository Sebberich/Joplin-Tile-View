// Turns typed Values into the display strings shown in cells / decorations.

import { Currency, DecimalSeparator, Value } from './types';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
	EUR: '€',
	USD: '$',
	CHF: 'CHF',
	GBP: '£',
};

function pad2(n: number): string {
	return String(Math.round(n)).padStart(2, '0');
}

/** Formats a plain number: up to 2 decimals, trailing zeros trimmed, using
 * the configured decimal separator. */
export function formatNumber(value: number, decimalSeparator: DecimalSeparator): string {
	const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
	// Avoid "-0".
	const normalized = rounded === 0 ? 0 : rounded;
	let s = normalized.toFixed(2);
	s = s.replace(/0+$/, '').replace(/\.$/, '');
	if (s === '' || s === '-') s = '0';
	return s.replace('.', decimalSeparator);
}

/** Formats a currency amount with fixed 2 decimals (money is not trimmed). */
function formatCurrencyNumber(value: number, decimalSeparator: DecimalSeparator): string {
	const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
	const normalized = rounded === 0 ? 0 : rounded;
	return normalized.toFixed(2).replace('.', decimalSeparator);
}

function formatDuration(minutesTotal: number): string {
	const sign = minutesTotal < -0.0001 ? '-' : '';
	const abs = Math.round(Math.abs(minutesTotal));
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	return `${sign}${h}:${pad2(m)} h`;
}

function formatDate(date: Date): string {
	const d = String(date.getDate()).padStart(2, '0');
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const y = date.getFullYear();
	return `${d}.${m}.${y}`;
}

function formatTimeOfDay(date: Date): string {
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatTimeMinutes(minutes: number): string {
	const total = Math.round(minutes);
	const h = Math.floor(total / 60) % 24;
	const m = total % 60;
	return `${pad2(h)}:${pad2(m)}`;
}

export function formatValue(value: Value, decimalSeparator: DecimalSeparator): string {
	switch (value.kind) {
		case 'number':
			return formatNumber(value.value, decimalSeparator);
		case 'duration':
			return formatDuration(value.minutes);
		case 'date':
			return formatDate(value.date);
		case 'datetime':
			return `${formatDate(value.date)} ${formatTimeOfDay(value.date)}`;
		case 'time':
			return formatTimeMinutes(value.minutes);
		case 'currency':
			return `${formatCurrencyNumber(value.value, decimalSeparator)} ${CURRENCY_SYMBOLS[value.currency]}`;
		case 'text':
			return value.value;
		case 'empty':
			return '';
		case 'error':
			return value.code;
		default:
			return '';
	}
}
