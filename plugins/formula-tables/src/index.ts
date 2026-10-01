import joplin from 'api';
import { ContentScriptType, SettingItemType, ToolbarButtonLocation } from 'api/types';

const SETTINGS_SECTION = 'formulaTables';
const DECIMAL_SEPARATOR_SETTING = 'formulaTables.decimalSeparator';

async function registerSettings(): Promise<void> {
	await joplin.settings.registerSection(SETTINGS_SECTION, {
		label: 'Formula Tables',
		iconName: 'fas fa-calculator',
		description: 'Settings for the Formula Tables plugin.',
	});

	await joplin.settings.registerSettings({
		[DECIMAL_SEPARATOR_SETTING]: {
			value: ',',
			type: SettingItemType.String,
			public: true,
			section: SETTINGS_SECTION,
			isEnum: true,
			options: { ',': 'Comma (12,50)', '.': 'Dot (12.50)' },
			label: 'Decimal separator',
			description: 'Used to format numbers and currency amounts. Comma (","), German-first default, or dot (".").',
		},
	});
}

async function currentSettings(): Promise<{ decimalSeparator: ',' | '.' }> {
	const value = await joplin.settings.value(DECIMAL_SEPARATOR_SETTING);
	return { decimalSeparator: value === '.' ? '.' : ',' };
}

async function registerContentScripts(): Promise<void> {
	await joplin.contentScripts.register(
		ContentScriptType.MarkdownItPlugin,
		'formulaTablesMarkdownIt',
		'./contentScripts/markdownIt.js',
	);
	await joplin.contentScripts.onMessage('formulaTablesMarkdownIt', async (message: unknown) => {
		if (message === 'getSettings') return currentSettings();
		return undefined;
	});

	await joplin.contentScripts.register(
		ContentScriptType.CodeMirrorPlugin,
		'formulaTablesCodeMirror',
		'./contentScripts/codeMirror.js',
	);
	await joplin.contentScripts.onMessage('formulaTablesCodeMirror', async (message: unknown) => {
		if (message === 'getSettings') return currentSettings();
		return undefined;
	});
}

async function registerCommands(): Promise<void> {
	// These delegate to the editor commands the CodeMirror content script
	// registers with codeMirrorWrapper.registerCommand(...). "Stempeln":
	// inserts the current time as a fixed value (not `now`, which would
	// keep changing every time the note is rendered/re-opened).
	await joplin.commands.register({
		name: 'formulaTables.insertNow',
		label: 'Stempeln (insert current time)',
		iconName: 'fas fa-clock',
		execute: async () => {
			await joplin.commands.execute('editor.execCommand', { name: 'formulaTables.insertNow' });
		},
	});

	await joplin.commands.register({
		name: 'formulaTables.insertNowDate',
		label: 'Insert current date+time',
		execute: async () => {
			await joplin.commands.execute('editor.execCommand', { name: 'formulaTables.insertNowDate' });
		},
	});

	await joplin.views.toolbarButtons.create('formulaTablesInsertNow', 'formulaTables.insertNow', ToolbarButtonLocation.EditorToolbar);
}

joplin.plugins.register({
	onStart: async function() {
		await registerSettings();
		await registerContentScripts();
		await registerCommands();
	},
});
