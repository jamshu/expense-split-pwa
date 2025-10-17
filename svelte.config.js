import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({
			fallback: 'index.html'
		}),
		paths: {
			// Use PUBLIC_BASE_PATH env var when provided (CI or manual override). Otherwise empty.
			base: process.env.PUBLIC_BASE_PATH ? process.env.PUBLIC_BASE_PATH : ''
		}
	}
};

export default config;
