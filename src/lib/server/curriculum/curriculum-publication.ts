/** A korábbi, beállítás nélküli tananyagok továbbra is nyilvánosak. */
export function publishedLevelSql(alias: string): string {
	return `NOT EXISTS (SELECT 1 FROM level_settings visibility WHERE visibility.level_id = ${alias}.id AND visibility.published = 0)`;
}
