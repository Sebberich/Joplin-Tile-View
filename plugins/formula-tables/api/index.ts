// Minimal, self-contained `joplin` global adapted by hand from the Joplin
// plugin API (see joplin/packages/generator-joplin templates and
// joplin/packages/lib/services/plugins/api). Only the surface this plugin
// uses is declared here.

import { Command, ContentScriptType, MenuItemLocation, SettingItem, SettingSection, ToolbarButtonLocation } from './types';

interface PluginRegistration {
	onStart: () => Promise<void>;
}

interface JoplinPlugins {
	register(script: PluginRegistration): void;
}

interface JoplinContentScripts {
	register(type: ContentScriptType, id: string, scriptPath: string): Promise<void>;
	onMessage(contentScriptId: string, callback: (message: unknown) => unknown): Promise<void>;
}

interface JoplinCommands {
	register(command: Command): Promise<void>;
	execute(commandName: string, ...args: unknown[]): Promise<unknown>;
}

interface JoplinSettings {
	registerSection(name: string, section: SettingSection): Promise<void>;
	registerSettings(settings: Record<string, SettingItem>): Promise<void>;
	value(key: string): Promise<unknown>;
	values(keys: string[]): Promise<Record<string, unknown>>;
}

interface JoplinToolbarButtons {
	create(id: string, commandName: string, location: ToolbarButtonLocation): Promise<void>;
}

interface JoplinMenuItems {
	create(id: string, commandName: string, location: MenuItemLocation): Promise<void>;
}

interface JoplinViews {
	toolbarButtons: JoplinToolbarButtons;
	menuItems: JoplinMenuItems;
}

interface Joplin {
	plugins: JoplinPlugins;
	contentScripts: JoplinContentScripts;
	commands: JoplinCommands;
	settings: JoplinSettings;
	views: JoplinViews;
}

declare const joplin: Joplin;

export default joplin;
export * from './types';
