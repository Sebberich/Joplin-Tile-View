// Pure data types for the Formula Tables language. No DOM / Joplin
// dependencies here so this module (and everything under src/core) can be
// unit tested with plain jest/ts-jest.

/** Error codes shown (in red) instead of a guessed result. */
export type ErrorCode = '#TYPE' | '#DIV/0' | '#REF' | '#SYNTAX' | '#CIRC';

export type Currency = 'EUR' | 'USD' | 'CHF' | 'GBP';

/** A typed value produced by parsing a literal or evaluating a formula. */
export type Value =
	| { kind: 'number'; value: number }
	// Duration, stored as (possibly negative) minutes.
	| { kind: 'duration'; minutes: number }
	// Calendar date, no time-of-day component. Stored as local midnight.
	| { kind: 'date'; date: Date }
	// Date + time of day.
	| { kind: 'datetime'; date: Date }
	// Time of day, stored as minutes since 00:00 (0..1439).
	| { kind: 'time'; minutes: number }
	| { kind: 'currency'; currency: Currency; value: number }
	// Plain, untyped text. Not usable in arithmetic.
	| { kind: 'text'; value: string }
	| { kind: 'empty' }
	| { kind: 'error'; code: ErrorCode };

export const err = (code: ErrorCode): Value => ({ kind: 'error', code });
export const isError = (v: Value): v is { kind: 'error'; code: ErrorCode } => v.kind === 'error';

/** Decimal separator used both for parsing currency/number literals for
 * display purposes and for formatting results. Parsing itself accepts both
 * ',' and '.' regardless of this setting. */
export type DecimalSeparator = ',' | '.';

export interface EvalOptions {
	/** Injected "now" so tests (and the renderer, for determinism within one
	 * render pass) are not at the mercy of the wall clock. */
	now: Date;
	decimalSeparator: DecimalSeparator;
}

/** A table as seen by the evaluator: header row + body rows of raw cell
 * text, exactly as typed in the Markdown source (before any formatting). */
export interface RawTable {
	headers: string[];
	rows: string[][];
}

export type EvaluatedKind = 'empty' | 'text' | 'value' | 'formula';

export interface EvaluatedCell {
	kind: EvaluatedKind;
	/** Formatted text to display. For formulas and literal values this is
	 * the computed/formatted result; for plain text cells it is the
	 * original text unchanged. */
	display: string;
	/** Set when kind is 'formula' or 'value' and evaluation failed. */
	error?: ErrorCode;
	/** The original raw cell text (used e.g. as a tooltip for formulas). */
	raw: string;
}
