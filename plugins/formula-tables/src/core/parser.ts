// Tokenizer + recursive-descent parser for formula expressions (the part of
// a cell after a leading '='). Produces an AST that evaluator.ts walks.
//
// Grammar (informal):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/') unary)*
//   unary   := '-' unary | primary
//   primary := NUMBER
//            | 'now'
//            | LITERAL_TYPE '{' rawContent '}'      -- date{...} time{...} eur{...} ...
//            | FUNC_NAME '{' args '}'                -- sum{...} sqrt{...} round{...} ...
//            | CELLREF                                -- A1
//            | '[' headerName ']'                     -- [Kommen]
//            | '(' expr ')'
//   args    := argItem (';' argItem)*
//   argItem := CELLREF ':' CELLREF                    -- range, only valid here
//            | expr
//
// Literal brace content (e.g. the "23.09.2026 14:05" inside date{...}) is
// taken verbatim from the source string (by token offsets), not
// reconstructed from tokens, so spacing/punctuation survive exactly.

export type LiteralTypeName = 'date' | 'time' | 'eur' | 'usd' | 'chf' | 'gbp';
export const LITERAL_TYPE_NAMES: LiteralTypeName[] = ['date', 'time', 'eur', 'usd', 'chf', 'gbp'];

export type FuncName = 'sum' | 'sqrt' | 'min' | 'max' | 'avg' | 'round';
export const FUNC_NAMES: FuncName[] = ['sum', 'sqrt', 'min', 'max', 'avg', 'round'];

export interface CellCoord { col: number; row: number }

export type AstNode =
	| { type: 'number'; value: number }
	| { type: 'now' }
	| { type: 'literal'; litType: LiteralTypeName; raw: string }
	| { type: 'cellRef'; coord: CellCoord }
	| { type: 'headerRef'; header: string }
	| { type: 'range'; from: CellCoord; to: CellCoord }
	| { type: 'func'; name: FuncName; args: AstNode[] }
	| { type: 'binop'; op: '+' | '-' | '*' | '/'; left: AstNode; right: AstNode }
	| { type: 'unary'; op: '-'; expr: AstNode };

export class ParseError extends Error {}

type TokenType = 'NUMBER' | 'IDENT' | 'CELLREF' | 'RAWBRACE' | 'LBRACE' | 'RBRACE' | 'LPAREN' | 'RPAREN'
	| 'LBRACKET' | 'RBRACKET' | 'SEMI' | 'COLON' | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'EOF';

interface Token { type: TokenType; text: string; start: number; end: number }

function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const n = input.length;
	const push = (type: TokenType, start: number, end: number) => tokens.push({ type, text: input.slice(start, end), start, end });
	while (i < n) {
		const c = input[i];
		if (/\s/.test(c)) { i++; continue; }
		if (c === '{') { push('LBRACE', i, i + 1); i++; continue; }
		if (c === '}') { push('RBRACE', i, i + 1); i++; continue; }
		if (c === '(') { push('LPAREN', i, i + 1); i++; continue; }
		if (c === ')') { push('RPAREN', i, i + 1); i++; continue; }
		if (c === '[') { push('LBRACKET', i, i + 1); i++; continue; }
		if (c === ']') { push('RBRACKET', i, i + 1); i++; continue; }
		if (c === ';') { push('SEMI', i, i + 1); i++; continue; }
		if (c === ':') { push('COLON', i, i + 1); i++; continue; }
		if (c === '+') { push('PLUS', i, i + 1); i++; continue; }
		if (c === '-') { push('MINUS', i, i + 1); i++; continue; }
		if (c === '*') { push('STAR', i, i + 1); i++; continue; }
		if (c === '/') { push('SLASH', i, i + 1); i++; continue; }
		if (/[A-Za-z]/.test(c)) {
			// Could be a CELLREF (letters directly followed by digits), a
			// literal-type name immediately followed by '{' (its content is
			// captured verbatim, see below - it is NOT re-tokenized, since
			// e.g. "23.09.2026" or "1,5h" are not valid general expressions),
			// or a plain IDENT (function name, or 'now').
			let j = i;
			while (j < n && /[A-Za-z]/.test(input[j])) j++;
			const letters = input.slice(i, j);

			if (j < n && input[j] === '{' && (LITERAL_TYPE_NAMES as string[]).includes(letters.toLowerCase())) {
				push('IDENT', i, j);
				let depth = 1;
				let k = j + 1;
				while (k < n && depth > 0) {
					if (input[k] === '{') depth++;
					else if (input[k] === '}') { depth--; if (depth === 0) break; }
					k++;
				}
				if (depth !== 0) throw new ParseError(`Unterminated '${letters}{...}'`);
				push('RAWBRACE', j + 1, k);
				i = k + 1; // past the closing '}'
				continue;
			}

			if (j < n && /[0-9]/.test(input[j])) {
				let k = j;
				while (k < n && /[0-9]/.test(input[k])) k++;
				push('CELLREF', i, k);
				i = k;
			} else {
				push('IDENT', i, j);
				i = j;
			}
			continue;
		}
		if (/[0-9]/.test(c)) {
			let j = i;
			while (j < n && /[0-9]/.test(input[j])) j++;
			if (input[j] === '.' || input[j] === ',') {
				let k = j + 1;
				while (k < n && /[0-9]/.test(input[k])) k++;
				if (k > j + 1) {
					push('NUMBER', i, k);
					i = k;
					continue;
				}
			}
			push('NUMBER', i, j);
			i = j;
			continue;
		}
		throw new ParseError(`Unexpected character '${c}'`);
	}
	tokens.push({ type: 'EOF', text: '', start: n, end: n });
	return tokens;
}

/** Parses "A1" style references into a 0-based column/row coordinate. Row 1
 * in the source text is the first body row (row index 0 here). */
function parseCellRefText(text: string): CellCoord {
	const m = /^([A-Za-z]+)([0-9]+)$/.exec(text);
	if (!m) throw new ParseError(`Invalid cell reference '${text}'`);
	let col = 0;
	for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
	col -= 1;
	const row = parseInt(m[2], 10) - 1;
	return { col, row };
}

class Parser {
	private tokens: Token[];
	private source: string;
	private pos = 0;

	constructor(tokens: Token[], source: string) {
		this.tokens = tokens;
		this.source = source;
	}

	peek(): Token { return this.tokens[this.pos]; }
	private next(): Token { return this.tokens[this.pos++]; }
	private expect(type: TokenType): Token {
		const t = this.next();
		if (t.type !== type) throw new ParseError(`Expected ${type} but got '${t.text || t.type}'`);
		return t;
	}

	parseExpr(): AstNode {
		let left = this.parseTerm();
		for (;;) {
			const t = this.peek();
			if (t.type === 'PLUS' || t.type === 'MINUS') {
				this.next();
				const right = this.parseTerm();
				left = { type: 'binop', op: t.type === 'PLUS' ? '+' : '-', left, right };
			} else {
				break;
			}
		}
		return left;
	}

	private parseTerm(): AstNode {
		let left = this.parseUnary();
		for (;;) {
			const t = this.peek();
			if (t.type === 'STAR' || t.type === 'SLASH') {
				this.next();
				const right = this.parseUnary();
				left = { type: 'binop', op: t.type === 'STAR' ? '*' : '/', left, right };
			} else {
				break;
			}
		}
		return left;
	}

	private parseUnary(): AstNode {
		if (this.peek().type === 'MINUS') {
			this.next();
			return { type: 'unary', op: '-', expr: this.parseUnary() };
		}
		return this.parsePrimary();
	}

	private parsePrimary(): AstNode {
		const t = this.peek();

		if (t.type === 'NUMBER') {
			this.next();
			return { type: 'number', value: parseFloat(t.text.replace(',', '.')) };
		}

		if (t.type === 'LPAREN') {
			this.next();
			const e = this.parseExpr();
			this.expect('RPAREN');
			return e;
		}

		if (t.type === 'LBRACKET') {
			this.next();
			const contentStart = t.end;
			while (this.peek().type !== 'RBRACKET') {
				if (this.peek().type === 'EOF') throw new ParseError("Unterminated '['");
				this.next();
			}
			const rbracket = this.next();
			const header = this.source.slice(contentStart, rbracket.start).trim();
			return { type: 'headerRef', header };
		}

		if (t.type === 'CELLREF') {
			this.next();
			const from = parseCellRefText(t.text);
			if (this.peek().type === 'COLON') {
				this.next();
				const toTok = this.expect('CELLREF');
				const to = parseCellRefText(toTok.text);
				return { type: 'range', from, to };
			}
			return { type: 'cellRef', coord: from };
		}

		if (t.type === 'IDENT') {
			this.next();
			const name = t.text.toLowerCase();

			if (name === 'now') return { type: 'now' };

			if ((LITERAL_TYPE_NAMES as string[]).includes(name)) {
				const rb = this.expect('RAWBRACE');
				return { type: 'literal', litType: name as LiteralTypeName, raw: rb.text.trim() };
			}

			if ((FUNC_NAMES as string[]).includes(name)) {
				this.expect('LBRACE');
				const args: AstNode[] = [];
				if (this.peek().type !== 'RBRACE') {
					args.push(this.parseArg());
					while (this.peek().type === 'SEMI') {
						this.next();
						args.push(this.parseArg());
					}
				}
				this.expect('RBRACE');
				return { type: 'func', name: name as FuncName, args };
			}

			throw new ParseError(`Unknown identifier '${t.text}'`);
		}

		throw new ParseError(`Unexpected token '${t.text || t.type}'`);
	}

	/** A function argument may be a range (only valid here) or a normal expr. */
	private parseArg(): AstNode {
		if (this.peek().type === 'CELLREF') {
			const save = this.pos;
			const fromTok = this.next();
			if (this.peek().type === 'COLON') {
				this.next();
				const toTok = this.expect('CELLREF');
				return { type: 'range', from: parseCellRefText(fromTok.text), to: parseCellRefText(toTok.text) };
			}
			this.pos = save;
		}
		return this.parseExpr();
	}
}

/**
 * Parses a formula's expression text (everything after the leading '=')
 * into an AST. Throws ParseError on invalid syntax.
 */
export function parseFormula(expressionText: string): AstNode {
	const tokens = tokenize(expressionText);
	const parser = new Parser(tokens, expressionText);
	const ast = parser.parseExpr();
	if (parser.peek().type !== 'EOF') {
		throw new ParseError(`Unexpected trailing input near '${parser.peek().text}'`);
	}
	return ast;
}
