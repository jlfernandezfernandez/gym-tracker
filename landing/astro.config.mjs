// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Static landing page. Build output (dist/) is plain HTML/CSS, servible desde cualquier CDN o Nginx.
export default defineConfig({
	// GitHub Pages: https://jlfernandezfernandez.github.io/gym-tracker/
	site: 'https://jlfernandezfernandez.github.io',
	base: '/gym-tracker',
	vite: {
		plugins: [tailwindcss()],
	},
});
