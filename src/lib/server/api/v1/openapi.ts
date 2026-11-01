export function openapi(): Record<string, unknown> {
	return {
		openapi: '3.0.0',
		info: { title: 'Leardy Public API', version: '1.0.0', description: 'Tanulás és kártyák kezelése tanári API kulccsal.' },
		servers: [{ url: '/api/v1' }],
		security: [{ bearerAuth: [] }],
		components: {
			securitySchemes: {
				bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'ld_...' }
			}
		},
		paths: {
			'/me': { get: { summary: 'Saját fiók' } },
			'/subjects': { get: { summary: 'Tantárgyak listája' } },
			'/subjects/{id}': { get: { summary: 'Tantárgy részletei' } },
			'/levels': { get: { summary: 'Szintek' } },
			'/materials': { get: { summary: 'Témakörök' } },
			'/lessons': { get: { summary: 'Leckék' }, post: { summary: 'Lecke létrehozása' } },
			'/lessons/{id}': { get: { summary: 'Lecke' }, patch: { summary: 'Lecke szerkesztése' }, delete: { summary: 'Lecke törlése' } },
			'/quizzes': { get: { summary: 'Kvízek' }, post: { summary: 'Kvíz létrehozása' } },
			'/quiz-questions': { get: { summary: 'Kérdések' }, post: { summary: 'Kérdés létrehozása' } },
			'/card-packs': { get: { summary: 'Hivatalos csomagok' }, post: { summary: 'Csomag létrehozása' } },
			'/lesson-cards': { get: { summary: 'Hivatalos kártyák' }, post: { summary: 'Kártya létrehozása' } },
			'/decks': { get: { summary: 'Saját csomagok' }, post: { summary: 'Csomag létrehozása' } },
			'/deck-cards': { get: { summary: 'Saját kártyák' }, post: { summary: 'Kártya létrehozása' } },
			'/progress/lessons': { get: { summary: 'Leckehaladás' }, post: { summary: 'Haladás mentése' } },
			'/progress/cards': { get: { summary: 'Kártyahaladás' } },
			'/progress/cards/due': { get: { summary: 'Esedékes kártyák' } },
			'/progress/cards/review': { post: { summary: 'Osztályzatok mentése' } },
			'/progress/stats': { get: { summary: 'Összesítő' } },
			'/library': { get: { summary: 'Könyvtár' }, post: { summary: 'Mentés' }, delete: { summary: 'Törlés' } },
			'/search': { get: { summary: 'Keresés' } }
		}
	};
}
