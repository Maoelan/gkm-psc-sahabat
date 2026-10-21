import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const publicBaseUrl = process.env.PUBLIC_BASE_URL || loadEnv(mode, process.cwd(), 'PUBLIC_').PUBLIC_BASE_URL;
	return {
		plugins: [
			sveltekit({
				paths: publicBaseUrl ? { origin: new URL(publicBaseUrl).origin } : undefined,
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'base-uri': ['self'],
						'connect-src': ['self'],
						'font-src': ['self'],
						'form-action': ['self'],
						'frame-ancestors': ['none'],
						'img-src': ['self', 'data:'],
						'object-src': ['none'],
						'script-src': ['self'],
						'style-src': ['self']
					}
				},
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// Build target for the local demo and future Node hosting.
				adapter: adapter()
			})
		]
	};
});
