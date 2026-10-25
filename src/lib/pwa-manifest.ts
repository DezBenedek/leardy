export function pwaManifest(dark: boolean) {
	const background = dark ? '#0c0a09' : '#ffffff';
	return {
		id: '/', name: 'Leardy: Tanulj okosan', short_name: 'Leardy',
		description: 'Modern tanuló app leckékkel, szókártyákkal és tanteremmel. Bárhol, bármikor.',
		start_url: '/', scope: '/', display: 'standalone' as const, orientation: 'portrait' as const,
		background_color: background, theme_color: background, lang: 'hu', categories: ['education'],
		icons: [
			{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
			{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
			{ src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
		]
	};
}
