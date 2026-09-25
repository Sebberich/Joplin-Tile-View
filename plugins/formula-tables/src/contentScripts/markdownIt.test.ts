import MarkdownIt from 'markdown-it';
import contentScriptFactory from './markdownIt';

function renderWith(markdown: string): string {
	const md = new MarkdownIt();
	const contentScript = contentScriptFactory({ contentScriptId: 'formula-tables', postMessage: async () => ({}) });
	contentScript.plugin(md as unknown as Parameters<typeof contentScript.plugin>[0]);
	return md.render(markdown);
}

describe('markdown-it content script', () => {
	test('renders formula results inside table cells', () => {
		const markdown = [
			'| Tag | Kommen | Gehen | Dauer |',
			'|---|---|---|---|',
			'| date{22.09.2026} | time{08:12} | time{16:40} | =[Gehen] - [Kommen] |',
		].join('\n');

		const html = renderWith(markdown);
		expect(html).toContain('ft-result');
		expect(html).toContain('8:28 h');
		expect(html).toContain('22.09.2026');
	});

	test('shows an error span for a bad formula instead of guessing', () => {
		const markdown = [
			'| A | B |',
			'|---|---|',
			'| eur{5} | =A1 + date{23.09.2026} |',
		].join('\n');

		const html = renderWith(markdown);
		expect(html).toContain('ft-error');
		expect(html).toContain('#TYPE');
	});

	test('leaves a table with no formulas or literals completely untouched', () => {
		const markdown = [
			'| A | B |',
			'|---|---|',
			'| hello | *world* |',
		].join('\n');

		const html = renderWith(markdown);
		expect(html).not.toContain('ft-result');
		expect(html).not.toContain('ft-error');
		expect(html).toContain('<em>world</em>');
	});

	test('plain text cells in an otherwise-active table keep their Markdown', () => {
		const markdown = [
			'| Tag | Note | Sum |',
			'|---|---|---|',
			'| date{22.09.2026} | *nice* | =1+1 |',
		].join('\n');

		const html = renderWith(markdown);
		expect(html).toContain('<em>nice</em>');
		expect(html).toContain('ft-result');
	});
});
