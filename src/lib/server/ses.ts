/* Amazon SES levélküldő Cloudflare Workershöz.
   SESv2 HTTPS API-t hív (SendEmail), SigV4 aláírással, külső
   függőség nélkül. SMTP nincs, a Worker csak fetch-csel mehet ki.
   Feladó: leardy@dezso.hu (SES-ben igazolt identitás kell).
   Kulcsok env-ben: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (secret),
   AWS_REGION (var), SES_FROM_EMAIL (var). */

export interface SesEnv {
	AWS_REGION?: string;
	AWS_ACCESS_KEY_ID?: string;
	AWS_SECRET_ACCESS_KEY?: string;
	SES_FROM_EMAIL?: string;
}

const enc = new TextEncoder();

async function sha256Hex(data: string | Uint8Array): Promise<string> {
	const bytes = typeof data === 'string' ? enc.encode(data) : data;
	const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
	const keyBytes = typeof key === 'string' ? enc.encode(key) : key;
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		keyBytes as BufferSource,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
	return new Uint8Array(sig);
}

async function getSignatureKey(
	secret: string,
	dateStamp: string,
	region: string,
	service: string
): Promise<Uint8Array> {
	const kDate = await hmacSha256('AWS4' + secret, dateStamp);
	const kRegion = await hmacSha256(kDate, region);
	const kService = await hmacSha256(kRegion, service);
	return hmacSha256(kService, 'aws4_request');
}

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function amzDates(now = new Date()): { amzDate: string; dateStamp: string } {
	const p = (n: number) => String(n).padStart(2, '0');
	const amzDate =
		`${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
		`T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
	return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/** Hiányzó SES konfig kulcsnevei, üres ha minden megvan. */
export function missingSesConfig(env: SesEnv): string[] {
	const missing: string[] = [];
	if (!env.AWS_REGION) missing.push('AWS_REGION');
	if (!env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
	if (!env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
	if (!env.SES_FROM_EMAIL) missing.push('SES_FROM_EMAIL');
	return missing;
}

export interface SimpleEmail {
	to: string;
	subject: string;
	text: string;
}

/* Egyszerű szöveges levél SESv2-vel. Hibánál dob. */
export async function sendSesEmail(env: SesEnv, mail: SimpleEmail): Promise<void> {
	const region = env.AWS_REGION?.trim();
	const accessKey = env.AWS_ACCESS_KEY_ID?.trim();
	const secretKey = env.AWS_SECRET_ACCESS_KEY?.trim();
	const from = env.SES_FROM_EMAIL?.trim();
	if (!region || !accessKey || !secretKey || !from) {
		throw new Error(`Hiányzó SES konfig: ${missingSesConfig(env).join(', ')}`);
	}
	const host = `email.${region}.amazonaws.com`;
	const path = '/v2/email/outbound-emails';
	const payload = JSON.stringify({
		FromEmailAddress: from,
		Destination: { ToAddresses: [mail.to] },
		Content: {
			Simple: {
				Subject: { Data: mail.subject, Charset: 'UTF-8' },
				Body: { Text: { Data: mail.text, Charset: 'UTF-8' } }
			}
		}
	});
	const payloadHash = await sha256Hex(payload);
	const { amzDate, dateStamp } = amzDates();
	const signedHeaders = 'content-type;host;x-amz-date';
	const canonicalRequest = [
		'POST',
		path,
		'',
		`content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`,
		signedHeaders,
		payloadHash
	].join('\n');
	const scope = `${dateStamp}/${region}/ses/aws4_request`;
	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		scope,
		await sha256Hex(canonicalRequest)
	].join('\n');
	const signingKey = await getSignatureKey(secretKey, dateStamp, region, 'ses');
	const signature = toHex(
		await (async () => {
			const cryptoKey = await crypto.subtle.importKey(
				'raw',
				signingKey as BufferSource,
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign']
			);
			const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(stringToSign));
			return new Uint8Array(sig);
		})()
	);
	const res = await fetch(`https://${host}${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			host,
			'x-amz-date': amzDate,
			authorization:
				`AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
				`SignedHeaders=${signedHeaders}, Signature=${signature}`
		},
		body: payload
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`SES hiba (${res.status}): ${body.slice(0, 300)}`);
	}
}

/* Jelszó-helyreállító levél szövege. */
export function resetCodeEmail(code: string): { subject: string; text: string } {
	return {
		subject: 'Leardy jelszó-helyreállítás',
		text:
			`Szia!\n\n` +
			`A jelszó-helyreállító kódod: ${code}\n\n` +
			`A kód 15 percig érvényes és egyszer használható. ` +
			`Ha nem te kérted, hagyd figyelmen kívül ezt a levelet.\n\n` +
			`Üdv,\nLeardy`
	};
}
