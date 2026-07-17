// @ts-check

import { readFileSync } from 'node:fs';

import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Static Mini App served by FastAPI (Docker copies dist/ to /app/static).
export default defineConfig({
	// compat: TanStack Query imports from "react"; preact/compat resolves it.
	integrations: [preact({ compat: true })],
	vite: {
		// Single source of truth: release-please bumps the manifest on each release.
		define: {
			__APP_VERSION__: JSON.stringify(
				JSON.parse(readFileSync('../../.release-please-manifest.json', 'utf8'))['.'],
			),
		},
		plugins: [tailwindcss()],
		server: {
			proxy: {
				// Local dev: `npm run dev` against the compose stack on :8000.
				'/api': 'http://localhost:8000',
				'/exercise-media': 'http://localhost:8000',
			},
		},
	},
});
