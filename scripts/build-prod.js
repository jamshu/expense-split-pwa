import { spawn } from 'child_process';

function run(cmd, args, opts = {}) {
	return new Promise((resolve, reject) => {
		const p = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
		p.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Command failed: ${cmd} ${args.join(' ')} (code ${code})`));
		});
	});
}

(async () => {
	try {
		console.log('Running production build');
		await run('npm', ['run', 'build']);
		console.log('Build complete');
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
})();
