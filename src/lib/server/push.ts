import type { D1Database } from '@cloudflare/workers-types';
import { ensureSecuritySchema } from './classroom';

/* Szerver oldali web push (RFC 8291 aes128gcm + RFC 8292 VAPID), WebCrypto-val.
 * Kulcskezeles: a VAPID P-256 par D1-ben (app_config / vapid_jwk) generalodik
 * elso hasznalatkor, igy nincs szukseg env secret beallitasra. */

export interface PushSubscription {
	endpoint: string;
	p256dh: string;
	auth: string;
}

const VAPID_SUBJECT = 'mailto:hello@leardy.app';
const TEXT_ENCODER = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
	const norm = s.replace(/-/g, '+').replace(/_/g, '/');
	const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
	const bin = atob(norm + pad);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', prk.slice().buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const data = new Uint8Array(info.length + 1);
	data.set(info, 0);
	data[data.length - 1] = 1;
	const sig = await crypto.subtle.sign('HMAC', key, data.slice().buffer as ArrayBuffer);
	return new Uint8Array(sig).slice(0, len);
}

/* RFC 5869 HKDF: PRK = HMAC(salt, ikm), OKM = HMAC(PRK, info || 0x01). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
	const saltKey = await crypto.subtle.importKey(
		'raw',
		salt.slice().buffer as ArrayBuffer,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm.slice().buffer as ArrayBuffer));
	return hkdfExpand(prk, info, len);
}

function derToRaw(sig: Uint8Array): Uint8Array {
	// ES256 alairas normalizalasa r || s (64 byte) alakra.
	// A WebCrypto elmeletileg DER-t ad, de egyes futtatokornyezetek
	// (pl. Node) nyers osszefuzest adnak vissza: azt is elfogadjuk.
	if (sig.length >= 63 && sig.length <= 66 && sig[0] !== 0x30) {
		const half = Math.floor(sig.length / 2);
		const r = sig.slice(0, half);
		const s = sig.slice(half);
		const out = new Uint8Array(64);
		out.set(r.slice(-32), 32 - Math.min(32, r.length));
		out.set(s.slice(-32), 64 - Math.min(32, s.length));
		return out;
	}
	const der = sig;
	let o = 0;
	if (der[o++] !== 0x30) throw new Error('bad sig');
	let len = der[o++];
	if (len & 0x80) {
		const n = len & 0x7f;
		len = 0;
		for (let i = 0; i < n; i++) len = (len << 8) | der[o++];
	}
	if (der[o++] !== 0x02) throw new Error('bad sig');
	let rLen = der[o++];
	let r = der.slice(o, o + rLen);
	o += rLen;
	if (der[o++] !== 0x02) throw new Error('bad sig');
	let sLen = der[o++];
	let s = der.slice(o, o + sLen);
	while (r.length > 32 && r[0] === 0) r = r.slice(1);
	while (s.length > 32 && s[0] === 0) s = s.slice(1);
	const out = new Uint8Array(64);
	out.set(r.slice(-32), 32 - Math.min(32, r.length));
	out.set(s.slice(-32), 64 - Math.min(32, s.length));
	return out;
}

interface VapidKeys {
	publicKey: string;
	privateJwk: JsonWebKey;
}

export async function ensureVapidKeys(db: D1Database): Promise<VapidKeys> {
	await ensureSecuritySchema(db);
	const row = await db
		.prepare(`SELECT value FROM app_config WHERE key = 'vapid_jwk'`)
		.bind()
		.first<{ value: string }>();
	if (row?.value) {
		try {
			const jwk = JSON.parse(row.value) as JsonWebKey;
			const pub = await publicKeyFromJwk(jwk);
			return { publicKey: pub, privateJwk: jwk };
		} catch {
			// serult kulcs: ujrageneraljuk
		}
	}
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
	const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
	const pub = await publicKeyFromJwk(jwk);
	await db
		.prepare(`INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ('vapid_jwk', ?, ?)`)
		.bind(JSON.stringify(jwk), Date.now())
		.run();
	return { publicKey: pub, privateJwk: jwk };
}

async function publicKeyFromJwk(jwk: JsonWebKey): Promise<string> {
	const x = b64urlDecode(jwk.x ?? '');
	const y = b64urlDecode(jwk.y ?? '');
	const raw = new Uint8Array(65);
	raw[0] = 4;
	raw.set(x.slice(-32), 33 - Math.min(32, x.length));
	raw.set(y.slice(-32), 65 - Math.min(32, y.length));
	return b64urlEncode(raw);
}

export async function getVapidPublicKey(db: D1Database): Promise<string> {
	return (await ensureVapidKeys(db)).publicKey;
}

export async function savePushSubscription(
	db: D1Database,
	userId: string,
	sub: PushSubscription
): Promise<void> {
	await ensureSecuritySchema(db);
	await db
		.prepare(
			`INSERT OR REPLACE INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
			 VALUES (?, ?, ?, ?, ?)`
		)
		.bind(sub.endpoint, userId, sub.p256dh, sub.auth, Date.now())
		.run();
}

export async function deletePushSubscription(db: D1Database, userId: string, endpoint: string): Promise<void> {
	await ensureSecuritySchema(db);
	await db
		.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`)
		.bind(endpoint, userId)
		.run();
}

export async function deletePushEndpoint(db: D1Database, endpoint: string): Promise<void> {
	try {
		await db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).run();
	} catch {
		// tabla hianya nem akaszthatja meg a valaszt
	}
}

async function subscriptionsForUsers(db: D1Database, userIds: string[]): Promise<PushSubscription[]> {
	if (userIds.length === 0) return [];
	const uniq = [...new Set(userIds)].slice(0, 500);
	const out: PushSubscription[] = [];
	// D1 valtozoszam korlat miatt darabolva.
	for (let i = 0; i < uniq.length; i += 50) {
		const chunk = uniq.slice(i, i + 50);
		const rows = await db
			.prepare(
				`SELECT endpoint, p256dh, auth FROM push_subscriptions
				 WHERE user_id IN (${chunk.map(() => '?').join(',')})`
			)
			.bind(...chunk)
			.all<PushSubscription>();
		for (const r of rows.results ?? []) out.push(r);
	}
	return out;
}

function vapidJwt(publicKey: string, privateJwk: JsonWebKey, audience: string): Promise<string> {
	const header = b64urlEncode(TEXT_ENCODER.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const payload = b64urlEncode(
		TEXT_ENCODER.encode(
			JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT })
		)
	);
	const data = `${header}.${payload}`;
	return (async () => {
		const key = await crypto.subtle.importKey(
			'jwk',
			privateJwk,
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['sign']
		);
		const sig = await crypto.subtle.sign(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			TEXT_ENCODER.encode(data).slice().buffer as ArrayBuffer
		);
		return `${data}.${b64urlEncode(derToRaw(new Uint8Array(sig)))}`;
	})();
}

async function encryptAes128Gcm(
	clientP256dh: Uint8Array,
	clientAuth: Uint8Array,
	payload: Uint8Array
): Promise<{ body: Uint8Array; serverPub: Uint8Array }> {
	const ecdhPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
	const clientKey = await crypto.subtle.importKey(
		'raw',
		clientP256dh.slice().buffer as ArrayBuffer,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const secretBits = await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: clientKey },
		ecdhPair.privateKey,
		256
	);
	const ecdhSecret = new Uint8Array(secretBits);
	const serverRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ecdhPair.publicKey));

	// RFC 8291 4.2: IKM = HKDF(auth_secret, ecdh_secret, key_info, 32),
	// CEK/nonce = HKDF(fejlec-so, IKM, info, 16/12).
	const infoBase = TEXT_ENCODER.encode('WebPush: info');
	const keyInfo = new Uint8Array(infoBase.length + 1 + clientP256dh.length + serverRaw.length);
	keyInfo.set(infoBase, 0);
	keyInfo[infoBase.length] = 0;
	keyInfo.set(clientP256dh, infoBase.length + 1);
	keyInfo.set(serverRaw, infoBase.length + 1 + clientP256dh.length);
	const ikm = await hkdf(clientAuth, ecdhSecret, keyInfo, 32);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cekInfo = TEXT_ENCODER.encode('Content-Encoding: aes128gcm');
	const cekInfoFull = new Uint8Array(cekInfo.length + 1);
	cekInfoFull.set(cekInfo, 0);
	const nonceInfo = TEXT_ENCODER.encode('Content-Encoding: nonce');
	const nonceInfoFull = new Uint8Array(nonceInfo.length + 1);
	nonceInfoFull.set(nonceInfo, 0);
	const cekFinal = await hkdf(salt, ikm, cekInfoFull, 16);
	const nonceFinal = await hkdf(salt, ikm, nonceInfoFull, 12);

	const rs = 4096;
	const record = new Uint8Array(1 + payload.length);
	record[0] = 2;
	record.set(payload, 1);
	if (record.length > rs - 16 - 1) throw new Error('payload tul nagy');
	const aesKey = await crypto.subtle.importKey('raw', cekFinal.slice().buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt']);
	const ct = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceFinal.slice().buffer as ArrayBuffer }, aesKey, record.slice().buffer as ArrayBuffer)
	);
	const header = new Uint8Array(16 + 4 + 1 + serverRaw.length);
	header.set(salt, 0);
	header[16] = (rs >>> 24) & 255;
	header[17] = (rs >>> 16) & 255;
	header[18] = (rs >>> 8) & 255;
	header[19] = rs & 255;
	header[20] = serverRaw.length;
	header.set(serverRaw, 21);
	const body = new Uint8Array(header.length + ct.length);
	body.set(header, 0);
	body.set(ct, header.length);
	return { body, serverPub: serverRaw };
}

export interface PushPayload {
	title: string;
	body: string;
	url: string;
	tag: string;
}

export async function sendPushToSubscription(
	db: D1Database,
	sub: PushSubscription,
	msg: PushPayload
): Promise<boolean> {
	try {
		const { privateJwk, publicKey } = await ensureVapidKeys(db);
		const endpoint = new URL(sub.endpoint);
		if (endpoint.protocol !== 'https:') return false;
		const jwt = await vapidJwt(publicKey, privateJwk, `${endpoint.protocol}//${endpoint.host}`);
		const payload = TEXT_ENCODER.encode(JSON.stringify(msg));
		const { body } = await encryptAes128Gcm(b64urlDecode(sub.p256dh), b64urlDecode(sub.auth), payload);
		const res = await fetch(sub.endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/octet-stream',
				'content-encoding': 'aes128gcm',
				authorization: `vapid t=${jwt}, k=${publicKey}`,
				urgency: 'high',
				ttl: '86400'
			},
			body: body.slice().buffer as ArrayBuffer
		});
		if (res.status === 404 || res.status === 410) {
			await deletePushEndpoint(db, sub.endpoint);
			return false;
		}
		return res.ok;
	} catch {
		return false;
	}
}

/* Egy felhasznalo osszes eszkozere kuldes (pl. ertekeles ertesito). */
export async function notifyUser(
	db: D1Database,
	opts: { userId: string; title: string; body: string; url: string; tag: string }
): Promise<void> {
	try {
		const subs = await subscriptionsForUsers(db, [opts.userId]);
		if (subs.length === 0) return;
		const msg: PushPayload = { title: opts.title, body: opts.body, url: opts.url, tag: opts.tag };
		await Promise.allSettled(subs.slice(0, 20).map((s) => sendPushToSubscription(db, s, msg)));
	} catch {
		// ertesites hiba nem ronthatja el a fo muveletet
	}
}

/* Tantermi esemeny szetkuldese minden tag + tanar eszkozere, a szerzo kivetelevel.
 * Tuzelj es felejtsd: a hivo nem varja meg (void), a valasz nem mulhat rajta. */
export async function notifyClassroom(
	db: D1Database,
	opts: { classroomId: string; excludeUserId?: string; title: string; body: string; url: string; tag: string }
): Promise<void> {
	try {
		const room = await db
			.prepare(`SELECT id, teacher_id FROM classrooms WHERE id = ?`)
			.bind(opts.classroomId)
			.first<{ id: string; teacher_id: string }>();
		if (!room) return;
		const members = await db
			.prepare(`SELECT user_id FROM classroom_members WHERE classroom_id = ? LIMIT 500`)
			.bind(opts.classroomId)
			.all<{ user_id: string }>();
		const ids = [room.teacher_id, ...((members.results ?? []).map((m) => m.user_id))].filter(
			(id) => id && id !== opts.excludeUserId
		);
		const subs = await subscriptionsForUsers(db, ids);
		if (subs.length === 0) return;
		const msg: PushPayload = { title: opts.title, body: opts.body, url: opts.url, tag: opts.tag };
		await Promise.allSettled(subs.slice(0, 200).map((s) => sendPushToSubscription(db, s, msg)));
	} catch {
		// ertesites hiba nem ronthatja el a fo muveletet
	}
}
