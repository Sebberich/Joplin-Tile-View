// Literal parsing, arithmetic type rules, and whole-table evaluation with
// memoization + circular-reference detection.

import { AstNode, CellCoord, FuncName, LiteralTypeName, ParseError, parseFormula } from './parser';
import { findHeaderIndex } from './table';
import { Currency, err, EvalOptions, EvaluatedCell, isError, RawTable, Value } from './types';
import { formatValue } from './format';

// ---------------------------------------------------------------------------
// Literal parsing
// ---------------------------------------------------------------------------

function parseNumberText(text: string): number | null {
	const t = text.trim();
	if (!/^-?\d+([.,]\d+)?$/.test(t)) return null;
	return parseFloat(t.replace(',', '.'));
}

interface ParsedDate { date: Date; hasTime: boolean }

/** Parses the content of date{...}. See KONZEPT.md "1. Tabellen mit
 * Formeln": '.'-separated = D.M.Y (year optional, 2-digit = 2000+y,
 * missing year = current year); '-'-separated = ISO Y-M-D. Optional
 * "HH:MM" after a space makes it a datetime. */
function parseDateLiteral(raw: string, now: Date): ParsedDate | null {
	const trimmed = raw.trim();
	const spaceIdx = trimmed.indexOf(' ');
	const datePart = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
	const timePart = spaceIdx === -1 ? null : trimmed.slice(spaceIdx + 1).trim();

	let year: number, month: number, day: number;

	if (datePart.includes('-')) {
		const parts = datePart.split('-');
		if (parts.length !== 3) return null;
		year = parseInt(parts[0], 10);
		month = parseInt(parts[1], 10);
		day = parseInt(parts[2], 10);
	} else if (datePart.includes('.')) {
		const parts = datePart.split('.').filter(p => p !== '');
		if (parts.length === 3) {
			day = parseInt(parts[0], 10);
			month = parseInt(parts[1], 10);
			const yearRaw = parts[2];
			year = yearRaw.length <= 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);
		} else if (parts.length === 2) {
			day = parseInt(parts[0], 10);
			month = parseInt(parts[1], 10);
			year = now.getFullYear();
		} else {
			return null;
		}
	} else {
		return null;
	}

	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	let hour = 0, minute = 0;
	if (timePart !== null) {
		const m = /^(\d{1,2}):(\d{2})$/.exec(timePart);
		if (!m) return null;
		hour = parseInt(m[1], 10);
		minute = parseInt(m[2], 10);
		if (hour > 23 || minute > 59) return null;
	}

	const date = new Date(year, month - 1, day, hour, minute, 0, 0);
	// Reject dates that JS silently rolled over (e.g. day 31 in a 30-day month).
	if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;

	return { date, hasTime: timePart !== null };
}

/** Parses the content of time{...}. Distinguishes bare "HH:MM[:SS]" (time
 * of day) from a value carrying an h/min/m unit (duration). */
function parseTimeLiteral(raw: string): Value | null {
	const t = raw.trim();

	// Compound duration: "2h30min", "1h30m".
	let m = /^(\d+)h(\d+)(?:min|m)$/.exec(t);
	if (m) return { kind: 'duration', minutes: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) };

	// "1:30h" - H:MM expressed as a duration in hours.
	m = /^(\d+):(\d+)h$/.exec(t);
	if (m) return { kind: 'duration', minutes: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) };

	// Decimal hours: "1,5h" / "1.5h".
	m = /^(-?\d+(?:[.,]\d+)?)h$/.exec(t);
	if (m) return { kind: 'duration', minutes: parseFloat(m[1].replace(',', '.')) * 60 };

	// Minutes: "90min" / "45m".
	m = /^(-?\d+(?:[.,]\d+)?)(?:min|m)$/.exec(t);
	if (m) return { kind: 'duration', minutes: parseFloat(m[1].replace(',', '.')) };

	// Bare time of day, no unit: "HH:MM" or "HH:MM:SS".
	m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
	if (m) {
		const hour = parseInt(m[1], 10);
		const minute = parseInt(m[2], 10);
		const second = m[3] ? parseInt(m[3], 10) : 0;
		if (hour > 23 || minute > 59 || second > 59) return null;
		return { kind: 'time', minutes: hour * 60 + minute + second / 60 };
	}

	return null;
}

const CURRENCY_CODES: Record<string, Currency> = { eur: 'EUR', usd: 'USD', chf: 'CHF', gbp: 'GBP' };

/** Evaluates the content of a `litType{raw}` node into a Value, or a
 * `#SYNTAX` error if the content does not match that literal's grammar. */
export function evalLiteralNode(litType: LiteralTypeName, raw: string, now: Date): Value {
	if (litType === 'date') {
		const parsed = parseDateLiteral(raw, now);
		if (!parsed) return err('#SYNTAX');
		return parsed.hasTime ? { kind: 'datetime', date: parsed.date } : { kind: 'date', date: parsed.date };
	}
	if (litType === 'time') {
		const parsed = parseTimeLiteral(raw);
		return parsed ?? err('#SYNTAX');
	}
	// Currency.
	const num = parseNumberText(raw);
	if (num === null) return err('#SYNTAX');
	return { kind: 'currency', currency: CURRENCY_CODES[litType], value: num };
}

/**
 * Tries to parse a whole cell's trimmed text as a single value literal (not
 * a formula). Returns null when the text is not a recognised literal, in
 * which case the caller should treat the cell as plain text.
 */
export function parseStandaloneLiteral(text: string, now: Date): Value | null {
	const t = text.trim();
	if (t === '') return null;
	if (/^now$/i.test(t)) return { kind: 'datetime', date: now };

	const num = parseNumberText(t);
	if (num !== null) return { kind: 'number', value: num };

	const m = /^(date|time|eur|usd|chf|gbp)\{([\s\S]*)\}$/i.exec(t);
	if (m) return evalLiteralNode(m[1].toLowerCase() as LiteralTypeName, m[2], now);

	return null;
}

// ---------------------------------------------------------------------------
// Arithmetic type rules
// ---------------------------------------------------------------------------

const MS_PER_MINUTE = 60000;
const MINUTES_PER_DAY = 1440;

function round2(n: number): number {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

function applyBinOp(op: '+' | '-' | '*' | '/', left: Value, right: Value): Value {
	if (isError(left)) return left;
	if (isError(right)) return right;

	// number op number (not rounded here - formatValue() trims for display;
	// keeping full precision internally avoids compounding rounding error
	// across chained formulas).
	if (left.kind === 'number' && right.kind === 'number') {
		if (op === '+') return { kind: 'number', value: left.value + right.value };
		if (op === '-') return { kind: 'number', value: left.value - right.value };
		if (op === '*') return { kind: 'number', value: left.value * right.value };
		if (right.value === 0) return err('#DIV/0');
		return { kind: 'number', value: left.value / right.value };
	}

	// datetime - datetime -> duration
	if (left.kind === 'datetime' && right.kind === 'datetime' && op === '-') {
		return { kind: 'duration', minutes: (left.date.getTime() - right.date.getTime()) / MS_PER_MINUTE };
	}

	// date - date -> duration
	if (left.kind === 'date' && right.kind === 'date' && op === '-') {
		return { kind: 'duration', minutes: (left.date.getTime() - right.date.getTime()) / MS_PER_MINUTE };
	}

	// datetime/date ± duration -> datetime
	if ((left.kind === 'datetime' || left.kind === 'date') && right.kind === 'duration' && (op === '+' || op === '-')) {
		const deltaMs = right.minutes * MS_PER_MINUTE * (op === '-' ? -1 : 1);
		return { kind: 'datetime', date: new Date(left.date.getTime() + deltaMs) };
	}
	if (left.kind === 'duration' && (right.kind === 'datetime' || right.kind === 'date') && op === '+') {
		return { kind: 'datetime', date: new Date(right.date.getTime() + left.minutes * MS_PER_MINUTE) };
	}

	// time - time -> duration, wrapped within 24h if negative
	if (left.kind === 'time' && right.kind === 'time' && op === '-') {
		let diff = left.minutes - right.minutes;
		if (diff < 0) diff += MINUTES_PER_DAY;
		return { kind: 'duration', minutes: diff };
	}

	// datetime - time / time - datetime -> duration, using only the
	// datetime's time-of-day component. This covers e.g. `now` (a
	// datetime/"Zeitpunkt") minus a `time{...}` clock-in value, which is
	// exactly what the Stempeluhr example in KONZEPT.md relies on.
	if (left.kind === 'datetime' && right.kind === 'time' && op === '-') {
		const leftMinutes = left.date.getHours() * 60 + left.date.getMinutes();
		let diff = leftMinutes - right.minutes;
		if (diff < 0) diff += MINUTES_PER_DAY;
		return { kind: 'duration', minutes: diff };
	}
	if (left.kind === 'time' && right.kind === 'datetime' && op === '-') {
		const rightMinutes = right.date.getHours() * 60 + right.date.getMinutes();
		let diff = left.minutes - rightMinutes;
		if (diff < 0) diff += MINUTES_PER_DAY;
		return { kind: 'duration', minutes: diff };
	}

	// time ± duration -> time (wrapped into 0..1439)
	if (left.kind === 'time' && right.kind === 'duration' && (op === '+' || op === '-')) {
		let minutes = (left.minutes + (op === '-' ? -right.minutes : right.minutes)) % MINUTES_PER_DAY;
		if (minutes < 0) minutes += MINUTES_PER_DAY;
		return { kind: 'time', minutes };
	}

	// duration ± duration -> duration
	if (left.kind === 'duration' && right.kind === 'duration' && (op === '+' || op === '-')) {
		return { kind: 'duration', minutes: op === '+' ? left.minutes + right.minutes : left.minutes - right.minutes };
	}

	// duration * number / number * duration -> duration
	if (left.kind === 'duration' && right.kind === 'number' && op === '*') {
		return { kind: 'duration', minutes: left.minutes * right.value };
	}
	if (left.kind === 'number' && right.kind === 'duration' && op === '*') {
		return { kind: 'duration', minutes: left.value * right.minutes };
	}

	// duration / number -> duration
	if (left.kind === 'duration' && right.kind === 'number' && op === '/') {
		if (right.value === 0) return err('#DIV/0');
		return { kind: 'duration', minutes: left.minutes / right.value };
	}

	// duration / duration -> number
	if (left.kind === 'duration' && right.kind === 'duration' && op === '/') {
		if (right.minutes === 0) return err('#DIV/0');
		return { kind: 'number', value: round2(left.minutes / right.minutes) };
	}

	// currency ± currency (same currency) -> currency
	if (left.kind === 'currency' && right.kind === 'currency' && (op === '+' || op === '-')) {
		if (left.currency !== right.currency) return err('#TYPE');
		return { kind: 'currency', currency: left.currency, value: round2(op === '+' ? left.value + right.value : left.value - right.value) };
	}

	// currency * number / number * currency -> currency
	if (left.kind === 'currency' && right.kind === 'number' && op === '*') {
		return { kind: 'currency', currency: left.currency, value: round2(left.value * right.value) };
	}
	if (left.kind === 'number' && right.kind === 'currency' && op === '*') {
		return { kind: 'currency', currency: right.currency, value: round2(left.value * right.value) };
	}

	// currency / number -> currency
	if (left.kind === 'currency' && right.kind === 'number' && op === '/') {
		if (right.value === 0) return err('#DIV/0');
		return { kind: 'currency', currency: left.currency, value: round2(left.value / right.value) };
	}

	// duration * currency / currency * duration -> currency (hourly rate)
	if (left.kind === 'duration' && right.kind === 'currency' && op === '*') {
		return { kind: 'currency', currency: right.currency, value: round2((left.minutes / 60) * right.value) };
	}
	if (left.kind === 'currency' && right.kind === 'duration' && op === '*') {
		return { kind: 'currency', currency: left.currency, value: round2((right.minutes / 60) * left.value) };
	}

	return err('#TYPE');
}

function applyUnaryMinus(v: Value): Value {
	if (isError(v)) return v;
	if (v.kind === 'number') return { kind: 'number', value: -v.value };
	if (v.kind === 'duration') return { kind: 'duration', minutes: -v.minutes };
	if (v.kind === 'currency') return { kind: 'currency', currency: v.currency, value: -v.value };
	return err('#TYPE');
}

// ---------------------------------------------------------------------------
// Aggregate functions (sum/min/max/avg/round/sqrt)
// ---------------------------------------------------------------------------

/** Numeric magnitude used to compare/aggregate homogeneous values, plus how
 * to rebuild a Value of the same kind from a numeric result. */
function numericMagnitude(v: Value): number | null {
	if (v.kind === 'number') return v.value;
	if (v.kind === 'duration') return v.minutes;
	if (v.kind === 'currency') return v.value;
	return null;
}

function rebuildLike(template: Value, magnitude: number): Value {
	if (template.kind === 'number') return { kind: 'number', value: round2(magnitude) };
	if (template.kind === 'duration') return { kind: 'duration', minutes: magnitude };
	if (template.kind === 'currency') return { kind: 'currency', currency: template.currency, value: round2(magnitude) };
	return err('#TYPE');
}

/** Checks two values are aggregable together (same kind, and for currency,
 * the same currency code). */
function sameAggregateType(a: Value, b: Value): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'currency' && b.kind === 'currency') return a.currency === b.currency;
	return a.kind === 'number' || a.kind === 'duration';
}

function aggregate(name: 'sum' | 'min' | 'max' | 'avg', values: Value[]): Value {
	// Empty cells and text cells are skipped (they never reach this
	// function - see collectValues), but an empty *list* is still possible
	// if every referenced cell was blank/text.
	const usable = values.filter(v => v.kind !== 'empty' && v.kind !== 'text');
	for (const v of usable) if (isError(v)) return v;
	if (usable.length === 0) return name === 'sum' ? { kind: 'number', value: 0 } : err('#TYPE');

	const first = usable[0];
	for (const v of usable) if (!sameAggregateType(first, v)) return err('#TYPE');

	const mags = usable.map(v => numericMagnitude(v) as number);
	if (name === 'sum') return rebuildLike(first, mags.reduce((a, b) => a + b, 0));
	if (name === 'min') return rebuildLike(first, Math.min(...mags));
	if (name === 'max') return rebuildLike(first, Math.max(...mags));
	return rebuildLike(first, mags.reduce((a, b) => a + b, 0) / mags.length);
}

// ---------------------------------------------------------------------------
// Table evaluation (memoized, with circular-reference detection)
// ---------------------------------------------------------------------------

interface EvalContext {
	table: RawTable;
	options: EvalOptions;
	memo: Map<string, Value>;
	visiting: Set<string>;
	currentRow: number;
}

function cellKey(row: number, col: number): string {
	return `${row}:${col}`;
}

function getRawCell(table: RawTable, row: number, col: number): string | null {
	if (row < 0 || row >= table.rows.length) return null;
	const line = table.rows[row];
	if (col < 0 || col >= line.length) return null;
	return line[col];
}

function evaluateCell(row: number, col: number, ctx: EvalContext): Value {
	const key = cellKey(row, col);
	const cached = ctx.memo.get(key);
	if (cached) return cached;

	if (ctx.visiting.has(key)) return err('#CIRC');

	const raw = getRawCell(ctx.table, row, col);
	if (raw === null) return err('#REF');

	const text = raw.trim();
	ctx.visiting.add(key);
	const prevRow = ctx.currentRow;
	ctx.currentRow = row;

	let result: Value;
	if (text === '') {
		result = { kind: 'empty' };
	} else if (text.startsWith('=')) {
		try {
			const ast = parseFormula(text.slice(1));
			result = evalAst(ast, ctx);
		} catch (e) {
			result = e instanceof ParseError ? err('#SYNTAX') : err('#SYNTAX');
		}
	} else {
		const lit = parseStandaloneLiteral(text, ctx.options.now);
		result = lit ?? { kind: 'text', value: text };
	}

	ctx.currentRow = prevRow;
	ctx.visiting.delete(key);
	// Don't cache circular-reference results permanently: only the final,
	// fully-resolved value for a cell should be memoized.
	if (!(result.kind === 'error' && result.code === '#CIRC')) ctx.memo.set(key, result);
	return result;
}

function collectRangeValues(from: CellCoord, to: CellCoord, ctx: EvalContext): Value[] {
	const rowStart = Math.min(from.row, to.row);
	const rowEnd = Math.max(from.row, to.row);
	const colStart = Math.min(from.col, to.col);
	const colEnd = Math.max(from.col, to.col);
	const values: Value[] = [];
	for (let r = rowStart; r <= rowEnd; r++) {
		for (let c = colStart; c <= colEnd; c++) {
			values.push(evaluateCell(r, c, ctx));
		}
	}
	return values;
}

function collectFuncArgValues(args: AstNode[], ctx: EvalContext): Value[] {
	const values: Value[] = [];
	for (const arg of args) {
		if (arg.type === 'range') {
			values.push(...collectRangeValues(arg.from, arg.to, ctx));
		} else {
			values.push(evalAst(arg, ctx));
		}
	}
	return values;
}

function evalFunc(name: FuncName, args: AstNode[], ctx: EvalContext): Value {
	if (name === 'sqrt') {
		if (args.length !== 1) return err('#SYNTAX');
		const v = evalAst(args[0], ctx);
		if (isError(v)) return v;
		if (v.kind !== 'number' || v.value < 0) return err('#TYPE');
		return { kind: 'number', value: round2(Math.sqrt(v.value)) };
	}

	if (name === 'round') {
		if (args.length < 1 || args.length > 2) return err('#SYNTAX');
		const v = evalAst(args[0], ctx);
		if (isError(v)) return v;
		let digits = 0;
		if (args.length === 2) {
			const d = evalAst(args[1], ctx);
			if (isError(d)) return d;
			if (d.kind !== 'number') return err('#TYPE');
			digits = Math.round(d.value);
		}
		const factor = Math.pow(10, digits);
		if (v.kind === 'number') return { kind: 'number', value: Math.round(v.value * factor) / factor };
		if (v.kind === 'currency') return { kind: 'currency', currency: v.currency, value: Math.round(v.value * factor) / factor };
		if (v.kind === 'duration') return { kind: 'duration', minutes: Math.round(v.minutes * factor) / factor };
		return err('#TYPE');
	}

	// sum / min / max / avg
	const values = collectFuncArgValues(args, ctx);
	return aggregate(name as 'sum' | 'min' | 'max' | 'avg', values);
}

function evalAst(node: AstNode, ctx: EvalContext): Value {
	switch (node.type) {
		case 'number':
			return { kind: 'number', value: node.value };
		case 'now':
			return { kind: 'datetime', date: ctx.options.now };
		case 'literal':
			return evalLiteralNode(node.litType, node.raw, ctx.options.now);
		case 'cellRef':
			return evaluateCell(node.coord.row, node.coord.col, ctx);
		case 'headerRef': {
			const idx = findHeaderIndex(ctx.table.headers, node.header);
			if (idx === -1) return err('#REF');
			return evaluateCell(ctx.currentRow, idx, ctx);
		}
		case 'range':
			// A bare range is only meaningful as a function argument.
			return err('#SYNTAX');
		case 'func':
			return evalFunc(node.name, node.args, ctx);
		case 'binop':
			return applyBinOp(node.op, evalAst(node.left, ctx), evalAst(node.right, ctx));
		case 'unary':
			return applyUnaryMinus(evalAst(node.expr, ctx));
		default:
			return err('#SYNTAX');
	}
}

/** True if a cell's raw text is a formula or a recognised value literal
 * (i.e. something this plugin needs to touch at all). Used by content
 * scripts to decide whether a table needs any processing. */
export function cellNeedsEvaluation(raw: string, now: Date): boolean {
	const t = raw.trim();
	if (t === '') return false;
	if (t.startsWith('=')) return true;
	return parseStandaloneLiteral(t, now) !== null;
}

/** Evaluates every body cell of a table. Returns a grid with the same shape
 * as `table.rows`. Header cells are not evaluated (only used for [Header]
 * lookups). */
export function evaluateTable(table: RawTable, options: EvalOptions): EvaluatedCell[][] {
	const ctx: EvalContext = { table, options, memo: new Map(), visiting: new Set(), currentRow: 0 };

	return table.rows.map((line, row) => line.map((raw, col) => {
		void row; void col;
		const text = raw.trim();
		if (text === '') return { kind: 'empty', display: '', raw };
		if (text.startsWith('=')) {
			const value = evaluateCell(row, col, ctx);
			if (isError(value)) return { kind: 'formula', display: value.code, error: value.code, raw };
			return { kind: 'formula', display: formatValue(value, options.decimalSeparator), raw };
		}
		const lit = parseStandaloneLiteral(text, options.now);
		if (lit === null) return { kind: 'text', display: raw, raw };
		if (isError(lit)) return { kind: 'value', display: lit.code, error: lit.code, raw };
		return { kind: 'value', display: formatValue(lit, options.decimalSeparator), raw };
	}));
}
