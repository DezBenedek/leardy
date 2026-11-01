import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const modules = new Map();
const libRoot = new URL('../src/lib/', import.meta.url);

/** A tesztek a tényleges TypeScript-modulokat és függőségeiket futtatják. */
export function typescriptModuleUrl(url) {
	const key = url.href;
	if (!modules.has(key)) modules.set(key, compile(url));
	return modules.get(key);
}

async function probe(base) {
	for (const candidate of [base.href, `${base.href}.ts`, `${base.href}.svelte.ts`, `${base.href}/index.ts`]) {
		const url = new URL(candidate);
		try {
			await stat(fileURLToPath(url));
			return url;
		} catch {
			// próbáljuk a következő kiterjesztést
		}
	}
	return null;
}

/** A $lib aliast és a relatív importokat a valódi fájlra oldja fel. */
async function resolveSpecifier(specifier, importerUrl) {
	if (specifier.startsWith('$lib/')) return probe(new URL(specifier.slice('$lib/'.length), libRoot));
	if (specifier.startsWith('.')) return probe(new URL(specifier, importerUrl));
	return null;
}

async function compile(url) {
	const source = await readFile(url, 'utf8');
	let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	for (const match of [...js.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
		const specifier = match[2];
		const local = await resolveSpecifier(specifier, url);
		const target = local ? await typescriptModuleUrl(local) : import.meta.resolve(specifier);
		js = js.replace(match[0], `from '${target}'`);
	}
	return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
