/* Egyparancsos lokális indítás: teljes build, utána `wrangler dev`.
   Ez szolgálja ki az appot és a LiveRoom Durable Objectet is, valódi
   WebSocket kapcsolattal. A `vite build --watch` szándékosan nincs itt:
   nagy alkalmazásnál a memóriában tartott figyelő build instabillá válik.
   UI változtatás után külön terminálban `pnpm run build`, a wrangler
   a kész kimenet változására magától újratölt.
   Gyors UI iteráláshoz (élő kapcsolat nélkül): `pnpm run dev:ui`.
   Kilépéskor (Ctrl+C) a workert is leállítjuk. */
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const NPM = isWindows ? 'pnpm.cmd' : 'pnpm';

async function main() {
	const build = spawn(NPM, ['run', 'build'], {
		stdio: 'inherit',
		shell: isWindows
	});
	const buildCode = await new Promise((resolve) => build.on('close', resolve));
	if (buildCode !== 0) {
		console.error('[dev] Az induló build meghiúsult, leállok.');
		process.exit(1);
	}

	const worker = spawn(NPM, ['exec', 'wrangler', 'dev'], {
		stdio: 'inherit',
		shell: isWindows
	});
	const shutdown = () => {
		if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGTERM');
		setTimeout(() => process.exit(0), 1500).unref?.();
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
	worker.on('close', (code) => process.exit(code ?? 0));
}

main().catch((error) => {
	console.error('[dev] Indítási hiba:', error instanceof Error ? error.message : error);
	process.exit(1);
});
