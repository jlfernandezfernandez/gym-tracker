// @ts-check

import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

// Static Mini App served by FastAPI (Docker copies dist/ to /app/static).
export default defineConfig({
	integrations: [react()],
	vite: {
		server: {
			proxy: {
				// Local dev: `npm run dev` against the compose stack on :8010.
				'/api': 'http://localhost:8010',
				'/exercise-media': 'http://localhost:8010',
			},
		},
	},
});
