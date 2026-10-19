#!/usr/bin/env node
/**
 * Smoke test for the built node (run `npm run build` first). Not published (outside `dist`).
 *
 *   CAPTCHANO_TEST_API_KEY=cn-... node scripts/smoke-test.mjs
 *
 * Runs the credential test (GET /v1/balance), Account → Get Balance, and a Captcha → Solve
 * (recaptcha_v2 on Google's public demo page) through the real node `execute()` with a minimal
 * IExecuteFunctions stand-in. The API key is never printed.
 *
 * CAPTCHANO_API_BASE overrides the base URL (used to run against a local mock server).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CaptchaNo } = require('../dist/nodes/CaptchaNo/CaptchaNo.node.js');
const { CaptchaNoApi } = require('../dist/credentials/CaptchaNoApi.credentials.js');

const apiKey = process.env.CAPTCHANO_TEST_API_KEY;
const baseOverride = process.env.CAPTCHANO_API_BASE;
if (!apiKey) {
	console.error('CAPTCHANO_TEST_API_KEY is not set; skipping live smoke test.');
	process.exit(2);
}

async function httpRequest(options) {
	const base = baseOverride ?? options.baseURL ?? '';
	const url = new URL(base + options.url);
	for (const [k, v] of Object.entries(options.qs ?? {})) url.searchParams.set(k, String(v));
	const headers = { ...(options.headers ?? {}), Authorization: `Bearer ${apiKey}` };
	if (options.body !== undefined) headers['Content-Type'] = 'application/json';
	const res = await fetch(url, {
		method: options.method ?? 'GET',
		headers,
		body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
		signal: AbortSignal.timeout(options.timeout ?? 30000),
	});
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	if (!options.ignoreHttpStatusErrors && res.status >= 400) {
		const err = new Error(`HTTP ${res.status}`);
		err.response = { status: res.status, body };
		throw err;
	}
	return options.returnFullResponse ? { statusCode: res.status, body, headers: {} } : body;
}

function makeContext(params, { continueOnFail = false } = {}) {
	const node = {
		name: 'CaptchaNo',
		type: 'n8n-nodes-captchano.captchaNo',
		typeVersion: 1,
		parameters: params,
	};
	return {
		getInputData: () => [{ json: {} }],
		getNode: () => node,
		continueOnFail: () => continueOnFail,
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		helpers: {
			httpRequestWithAuthentication: async (_cred, options) => httpRequest(options),
			assertBinaryData: () => {},
			getBinaryDataBuffer: async () => Buffer.alloc(0),
		},
	};
}

const summarize = (json) => ({
	id: json.id,
	type: json.type,
	status: json.status,
	cost: json.cost,
	solveTime: json.solveTime,
	tokenLength: typeof json.token === 'string' ? json.token.length : undefined,
	error: json.error,
});

let failures = 0;
async function step(name, fn) {
	try {
		const out = await fn();
		console.log(`PASS  ${name}`, out === undefined ? '' : JSON.stringify(out));
	} catch (e) {
		failures++;
		console.log(`FAIL  ${name}: ${e.message}${e.description ? ` — ${e.description}` : ''}`);
	}
}

const node = new CaptchaNo();

await step('credential test (GET /v1/balance)', async () => {
	const cred = new CaptchaNoApi();
	const res = await httpRequest({
		...cred.test.request,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
	if (res.statusCode !== 200)
		throw new Error(`status ${res.statusCode}: ${JSON.stringify(res.body)}`);
	return { currency: res.body.currency, hasBalance: typeof res.body.balance === 'string' };
});

await step('Account → Get Balance', async () => {
	const [[item]] = await node.execute.call(
		makeContext({ resource: 'account', operation: 'getBalance' }),
	);
	return { currency: item.json.currency, hasBalance: typeof item.json.balance === 'string' };
});

let taskId;
await step('Captcha → Solve (recaptcha_v2, Google demo)', async () => {
	const [[item]] = await node.execute.call(
		makeContext({
			resource: 'captcha',
			operation: 'solve',
			captchaType: 'recaptcha_v2',
			url: 'https://www.google.com/recaptcha/api2/demo',
			sitekey: '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-',
			additionalFields: {},
			options: { waitSeconds: 60, pollUntilReady: true, pollTimeoutSeconds: 180 },
		}),
	);
	taskId = item.json.id;
	if (item.json.status !== 'ready' || !item.json.token)
		throw new Error(JSON.stringify(summarize(item.json)));
	return summarize(item.json);
});

if (taskId) {
	await step('Captcha → Get Result', async () => {
		const [[item]] = await node.execute.call(
			makeContext({ resource: 'captcha', operation: 'getResult', taskId }),
		);
		return summarize(item.json);
	});
}

await step('Captcha → Get Result (unknown id, continueOnFail)', async () => {
	const [[item]] = await node.execute.call(
		makeContext(
			{ resource: 'captcha', operation: 'getResult', taskId: 'does-not-exist' },
			{ continueOnFail: true },
		),
	);
	if (!item.json.error) throw new Error('expected an error item');
	return { error: item.json.error };
});

process.exit(failures ? 1 : 0);
