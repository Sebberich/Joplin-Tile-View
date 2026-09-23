// Minimal, self-contained subset of Joplin's plugin API type declarations,
// adapted by hand from the joplin/packages/generator-joplin templates
// (see https://github.com/laurent22/joplin/tree/dev/packages/lib/services/plugins/api).
// Only the pieces this plugin actually uses are declared here, so the build
// does not depend on the full Joplin monorepo type tree.

export enum ContentScriptType {
	MarkdownItPlugin = 'markdownItPlugin',
	CodeMirrorPlugin = 'codeMirrorPlugin',
}

export enum SettingItemType {
	Int = 1,
	String = 2,
	Bool = 3,
	Array = 4,
	Object = 5,
	Button = 6,
}

export enum ToolbarButtonLocation {
	NoteToolbar = 'noteToolbar',
	EditorToolbar = 'editorToolbar',
}

export enum MenuItemLocation {
	Tools = 'tools',
}

export interface SettingItem {
	value: unknown;
	type: SettingItemType;
	public: boolean;
	label: string;
	description?: string;
	options?: Record<string, string>;
	isEnum?: boolean;
	section?: string;
}

export interface SettingSection {
	label: string;
	iconName?: string;
	description?: string;
}

export interface Command {
	name: string;
	label?: string;
	iconName?: string;
	enabledCondition?: string;
	execute(...args: unknown[]): Promise<unknown> | unknown;
}
