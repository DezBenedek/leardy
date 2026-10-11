import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const modules = new Map();

/** A tesztek a tényleges TypeScript-modulokat és relatív függőségeiket futtatják. */
export function typescriptModuleUrl(url) {
	const key = url.href;
	if (!modules.has(key)) modules.set(key, compile(url));
	return modules.get(key);
}

async function compile(url) {
	const source = await readFile(url, 'utf8');
	let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	for (const match of [...js.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)]) {
		const specifier = match[2];
		const target = specifier.startsWith('.')
			? await typescriptModuleUrl(new URL(specifier.endsWith('.ts') ? specifier : `${specifier}.ts`, url))
			: import.meta.resolve(specifier);
		js = js.replace(match[0], `from '${target}'`);
	}
	return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
