#!/usr/bin/env node
// Prüft, ob Nostr-Relays als Transport für geteilte Einkaufslisten taugen.
//
// Simuliert das geplante Datenmodell: eine Liste = ein gemeinsamer Schlüssel,
// ein Artikel = ein adressierbares NIP-78-Event (kind 30078), dessen d-Tag aus
// dem Artikelnamen abgeleitet ist. Inhalt NIP-44-verschlüsselt.
//
//   node probe.mjs                          Standard-Relays aus relays.txt testen
//   node probe.mjs wss://relay.example      bestimmte Relays testen
//   node probe.mjs --keep …                 Testdaten nicht löschen, Schlüssel ausgeben
//   node probe.mjs --check <key-hex> …      nur nachsehen, was von einem --keep-Lauf noch da ist

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { finalizeEvent, getPublicKey, verifyEvent, nip44 } from 'nostr-tools';

const KIND = 30078;
const STEP_TIMEOUT_MS = 10000;
const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- Schlüsselableitung (so wie sie auch die App machen würde) ----------

const hkdf = (key, info) => new Uint8Array(crypto.hkdfSync('sha256', key, new Uint8Array(0), info, 32));
const normalize = name => name.trim().toLowerCase().normalize('NFC');

function deriveList(listKey) {
	const sk = hkdf(listKey, 'joplin-tiles/list/nostr-sk');
	const convKey = hkdf(listKey, 'joplin-tiles/list/nip44');
	return {
		sk,
		pk: getPublicKey(sk),
		convKey,
		dTag: name => crypto.createHmac('sha256', listKey).update(`item:${normalize(name)}`).digest('hex'),
		encrypt: obj => nip44.encrypt(JSON.stringify(obj), convKey),
		decrypt: s => JSON.parse(nip44.decrypt(s, convKey)),
	};
}

// ---------- Minimaler NIP-01-Client ----------

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxyAgent = proxy ? new HttpsProxyAgent(proxy) : undefined;
const agentFor = url => (/^(wss|https):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || !/^(wss|https):/.test(url)) ? undefined : proxyAgent;

const withTimeout = (p, what) => Promise.race([
	p,
	new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${what}`)), STEP_TIMEOUT_MS)),
]);

class Conn {
	static async open(url) {
		const c = new Conn();
		c.ws = new WebSocket(url, { agent: agentFor(url) });
		c.pendingOk = new Map();
		c.subs = new Map();
		c.notices = [];
		c.ws.on('message', data => c.onMessage(data));
		c.ws.on('error', () => {});
		await withTimeout(new Promise((resolve, reject) => {
			c.ws.once('open', resolve);
			c.ws.once('error', reject);
			c.ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
		}), 'Verbindung');
		return c;
	}

	onMessage(data) {
		let msg;
		try { msg = JSON.parse(data.toString()); } catch { return; }
		const [type, a, b, c] = msg;
		if (type === 'OK') this.pendingOk.get(a)?.({ ok: b, message: c ?? '' });
		else if (type === 'EVENT') this.subs.get(a)?.onEvent(b);
		else if (type === 'EOSE') this.subs.get(a)?.onEose();
		else if (type === 'CLOSED') this.subs.get(a)?.onClosed(b);
		else if (type === 'NOTICE') this.notices.push(a);
		else if (type === 'AUTH') this.authChallenge = a;
	}

	publish(event) {
		const p = new Promise(resolve => this.pendingOk.set(event.id, resolve));
		this.ws.send(JSON.stringify(['EVENT', event]));
		return withTimeout(p, 'OK auf EVENT');
	}

	// Liefert alle gespeicherten Events bis EOSE.
	query(filter) {
		const id = crypto.randomBytes(4).toString('hex');
		const events = [];
		const p = new Promise((resolve, reject) => this.subs.set(id, {
			onEvent: e => events.push(e),
			onEose: () => resolve(events),
			onClosed: reason => reject(new Error(`CLOSED: ${reason}`)),
		}));
		this.ws.send(JSON.stringify(['REQ', id, filter]));
		return withTimeout(p, 'EOSE').finally(() => {
			this.subs.delete(id);
			if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(['CLOSE', id]));
		});
	}

	// Offene Subscription für Echtzeit-Tests.
	subscribe(filter, onEvent) {
		const id = crypto.randomBytes(4).toString('hex');
		const eose = new Promise(resolve => this.subs.set(id, { onEvent, onEose: resolve, onClosed: () => {} }));
		this.ws.send(JSON.stringify(['REQ', id, filter]));
		return withTimeout(eose, 'EOSE der Subscription');
	}

	close() { try { this.ws.close(); } catch { /* egal */ } }
}

async function fetchNip11(url) {
	const httpUrl = url.replace(/^ws/, 'http');
	const { default: https } = await import(httpUrl.startsWith('https') ? 'node:https' : 'node:http');
	return withTimeout(new Promise((resolve, reject) => {
		https.get(httpUrl, { agent: agentFor(httpUrl), headers: { Accept: 'application/nostr+json' } }, res => {
			let body = '';
			res.on('data', d => { body += d; });
			res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
		}).on('error', reject);
	}), 'NIP-11').catch(() => null);
}

// ---------- Testablauf pro Relay ----------

function makeItem(list, name, payload, createdAt) {
	return finalizeEvent({
		kind: KIND,
		created_at: createdAt,
		tags: [['d', list.dTag(name)]],
		content: list.encrypt(payload),
	}, list.sk);
}

async function probeRelay(url, list, { keep }) {
	const r = { url, steps: {}, notes: [] };
	const step = async (name, fn) => {
		const t0 = Date.now();
		try {
			const v = await fn();
			r.steps[name] = { pass: v?.pass ?? true, ms: Date.now() - t0, ...v };
		} catch (e) {
			r.steps[name] = { pass: false, ms: Date.now() - t0, error: e.message };
		}
		return r.steps[name];
	};

	r.info = await fetchNip11(url);
	if (r.info?.limitation) r.limitation = r.info.limitation;

	let a;
	const conn = await step('verbinden', async () => { a = await Conn.open(url); return { pass: true }; });
	if (!conn.pass) return r;

	const now = Math.floor(Date.now() / 1000);
	const milch = name => ({ name, detail: '', offen: true });
	const published = [];
	const pub = async (ev, conn = a) => {
		const res = await conn.publish(ev);
		if (res.ok) published.push(ev);
		return res;
	};

	// 1. Schreiben: erste Version eines Artikels.
	await step('schreiben', async () => {
		const res = await pub(makeItem(list, 'Milch', { ...milch('Milch'), v: 1 }, now - 3));
		return { pass: res.ok, message: res.message };
	});

	// 2. Neuere Version desselben Artikels soll die alte ersetzen.
	await step('ersetzen', async () => {
		const res = await pub(makeItem(list, 'Milch', { ...milch('Milch'), v: 2, offen: false }, now - 2));
		if (!res.ok) return { pass: false, message: res.message };
		const evs = await a.query({ kinds: [KIND], authors: [list.pk], '#d': [list.dTag('Milch')] });
		const versions = evs.map(e => list.decrypt(e.content).v);
		return { pass: evs.length === 1 && versions[0] === 2, gespeichert: versions };
	});

	// 3. Eine ältere Version, die verspätet ankommt (Gerät war offline), darf nicht gewinnen.
	await step('alt_verworfen', async () => {
		const res = await pub(makeItem(list, 'Milch', { ...milch('Milch'), v: 0 }, now - 60));
		const evs = await a.query({ kinds: [KIND], authors: [list.pk], '#d': [list.dTag('Milch')] });
		const versions = evs.map(e => list.decrypt(e.content).v);
		// Selbst wenn das Relay mehrere liefert, wählt der Client das neueste – bewertet wird der Relay-Zustand.
		return { pass: evs.length === 1 && versions[0] === 2, ok: res.ok, message: res.message, gespeichert: versions };
	});

	// 3b. Gerät war drei Tage offline und reicht eine Änderung mit ihrem echten Zeitstempel nach.
	//     Manche Relays lehnen alte created_at ab – dann muss die App den Zeitpunkt anders transportieren.
	await step('offline_3d', async () => {
		const res = await pub(makeItem(list, 'Butter', milch('Butter'), now - 3 * 86400));
		return { pass: res.ok, message: res.message };
	});

	// 4. Echtzeit: Gerät B abonniert, Gerät A schreibt einen neuen Artikel.
	await step('echtzeit', async () => {
		const b = await Conn.open(url);
		try {
			let resolveSeen;
			const seen = new Promise(resolve => { resolveSeen = resolve; });
			const d = list.dTag('Brot');
			await b.subscribe({ kinds: [KIND], authors: [list.pk], since: now - 5 }, e => {
				if (e.tags.some(t => t[0] === 'd' && t[1] === d)) resolveSeen(Date.now());
			});
			const t0 = Date.now();
			const res = await pub(makeItem(list, 'Brot', milch('Brot'), Math.floor(Date.now() / 1000)));
			if (!res.ok) return { pass: false, message: res.message };
			const t1 = await withTimeout(seen, 'Event bei Gerät B');
			return { pass: true, latenz_ms: t1 - t0 };
		} finally { b.close(); }
	});

	// 5. Größen des verschlüsselten Inhalts: ein typischer Artikel liegt bei 0,2–0,5 kB.
	for (const kb of [0.5, 1, 4, 16, 64]) {
		await step(`groesse_${kb}kb`, async () => {
			// NIP-44 polstert auf und kodiert Base64 – Füllmenge grob so, dass der Inhalt ~kb groß wird.
			const filler = 'x'.repeat(Math.floor(kb * 1024 * 0.7));
			const res = await pub(makeItem(list, `gross-${kb}`, { name: `gross-${kb}`, filler }, now - 1));
			return { pass: res.ok, message: res.message };
		});
	}

	// 6. Kaltstart: frische Verbindung lädt die komplette Liste und prüft Signaturen.
	await step('liste_laden', async () => {
		const c = await Conn.open(url);
		try {
			const evs = await c.query({ kinds: [KIND], authors: [list.pk] });
			const valid = evs.filter(e => verifyEvent(e));
			const dTags = new Set(valid.map(e => e.tags.find(t => t[0] === 'd')?.[1]));
			const expected = new Set(published.map(e => e.tags[0][1]));
			return { pass: [...expected].every(d => dTags.has(d)), gefunden: dTags.size, erwartet: expected.size };
		} finally { c.close(); }
	});

	// 7. Aufräumen per NIP-09.
	if (!keep) {
		await step('loeschen', async () => {
			const dTags = [...new Set(published.map(e => e.tags[0][1]))];
			const del = finalizeEvent({
				kind: 5,
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					...dTags.map(d => ['a', `${KIND}:${list.pk}:${d}`]),
					...published.map(e => ['e', e.id]),
					['k', String(KIND)],
				],
				content: 'probe cleanup',
			}, list.sk);
			const res = await a.publish(del);
			const rest = await a.query({ kinds: [KIND], authors: [list.pk] });
			return { pass: res.ok && rest.length === 0, message: res.message, verbleibend: rest.length };
		});
	}

	if (a.notices.length) r.notes.push(...a.notices);
	if (a.authChallenge) r.notes.push('Relay verlangt/erlaubt NIP-42 AUTH');
	a.close();
	return r;
}

async function checkRelay(url, list) {
	try {
		const c = await Conn.open(url);
		try {
			const evs = await c.query({ kinds: [KIND], authors: [list.pk] });
			const now = Math.floor(Date.now() / 1000);
			return { url, gefunden: evs.length, alter_h: evs.map(e => ((now - e.created_at) / 3600).toFixed(1)) };
		} finally { c.close(); }
	} catch (e) {
		return { url, error: e.message };
	}
}

// ---------- Ausgabe ----------

const COLS = ['verbinden', 'schreiben', 'ersetzen', 'alt_verworfen', 'offline_3d', 'echtzeit', 'groesse_0.5kb', 'groesse_1kb', 'groesse_4kb', 'groesse_16kb', 'groesse_64kb', 'liste_laden', 'loeschen'];

function printTable(results) {
	const short = { verbinden: 'conn', schreiben: 'write', ersetzen: 'repl', alt_verworfen: 'stale', offline_3d: 'off3d', echtzeit: 'live', 'groesse_0.5kb': '.5k', groesse_1kb: '1k', groesse_4kb: '4k', groesse_16kb: '16k', groesse_64kb: '64k', liste_laden: 'load', loeschen: 'del' };
	const w = Math.max(...results.map(r => r.url.length), 5);
	console.log(`${'relay'.padEnd(w)}  ${COLS.map(c => short[c].padStart(5)).join(' ')}`);
	for (const r of results) {
		const cells = COLS.map(c => {
			const s = r.steps[c];
			if (!s) return '    –';
			if (!s.pass) return '   ✗ ';
			if (c === 'echtzeit') return `${s.latenz_ms}ms`.padStart(5);
			return '   ✓ ';
		});
		console.log(`${r.url.padEnd(w)}  ${cells.join(' ')}`);
	}
	console.log('\nFehlerdetails:');
	for (const r of results) {
		for (const [name, s] of Object.entries(r.steps)) {
			if (!s.pass) console.log(`  ${r.url} ${name}: ${s.error ?? s.message ?? JSON.stringify(s)}`);
		}
		const l = r.limitation;
		if (l && (l.auth_required || l.payment_required || l.restricted_writes)) {
			console.log(`  ${r.url} NIP-11: auth_required=${!!l.auth_required} payment_required=${!!l.payment_required} restricted_writes=${!!l.restricted_writes}`);
		}
		for (const n of r.notes) console.log(`  ${r.url} Hinweis: ${n}`);
	}
}

// ---------- main ----------

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const checkIdx = args.indexOf('--check');
const checkKey = checkIdx >= 0 ? args[checkIdx + 1] : null;
const urls = args.filter((x, i) => !x.startsWith('--') && (checkIdx < 0 || i !== checkIdx + 1));
const relays = urls.length ? urls : fs.readFileSync(path.join(here, 'relays.txt'), 'utf8')
	.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

if (checkKey) {
	const list = deriveList(Buffer.from(checkKey, 'hex'));
	const results = await Promise.all(relays.map(u => checkRelay(u, list)));
	for (const r of results) console.log(r.error ? `${r.url}: Fehler ${r.error}` : `${r.url}: ${r.gefunden} Events, Alter [h]: ${r.alter_h.join(', ')}`);
	process.exit(0);
}

const listKey = crypto.randomBytes(32);
const list = deriveList(listKey);
console.log(`Testliste pubkey ${list.pk}${keep ? `\nSchlüssel für --check: ${listKey.toString('hex')}` : ''}\n`);

const results = await Promise.all(relays.map(u => probeRelay(u, list, { keep })));
printTable(results);

const out = path.join(here, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), keep, pubkey: list.pk, results }, null, 2));
console.log(`\nDetails: ${path.relative(process.cwd(), out)}`);
process.exit(0);
