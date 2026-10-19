import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export const CAPTCHANO_BASE_URL = 'https://api.captchano.com';
export const CREDENTIAL_NAME = 'captchaNoApi';
export const POLL_INTERVAL_MS = 5000;
export const MAX_WAIT_SECONDS = 120;

export type CaptchaType =
	| 'recaptcha_v2'
	| 'recaptcha_v3'
	| 'recaptcha_enterprise'
	| 'turnstile'
	| 'datadome'
	| 'image';

export interface CaptchaNoSolution extends IDataObject {
	token?: string;
	cookie?: string;
	text?: string;
	userAgent?: string;
}

export interface CaptchaNoTask extends IDataObject {
	id: string;
	type: CaptchaType;
	status: 'solving' | 'ready' | 'failed';
	solution?: CaptchaNoSolution;
	error?: { code: string; message: string };
	cost?: string;
	billedFrom?: string;
	solveTime?: number;
	createdAt?: string;
}

export interface CaptchaNoResponse {
	statusCode: number;
	body: IDataObject;
}

/**
 * Human-readable explanations for every error code the CaptchaNo API returns.
 */
export const ERROR_MESSAGES: Record<string, { message: string; description: string }> = {
	invalid_api_key: {
		message: 'Invalid CaptchaNo API key',
		description:
			'The API key is missing or not valid. Check the CaptchaNo credential, or create a new key at https://captchano.com/dashboard/keys.',
	},
	insufficient_balance: {
		message: 'Insufficient CaptchaNo balance',
		description:
			'Your account balance is too low for this solve. Top up at https://captchano.com/dashboard. Failed solves are never billed.',
	},
	unsupported_type: {
		message: 'Unsupported captcha type',
		description:
			'The requested captcha type is not supported. Use one of: recaptcha_v2, recaptcha_v3, recaptcha_enterprise, turnstile, datadome, image.',
	},
	invalid_sitekey: {
		message: 'Invalid site key',
		description:
			'The site key was rejected. Copy the exact site key from the target page (data-sitekey attribute or the render= parameter).',
	},
	proxy_required: {
		message: 'A proxy is required for this captcha type',
		description:
			'DataDome solves must use a proxy, e.g. http://user:pass@host:port (http, socks4 or socks5).',
	},
	proxy_unreachable: {
		message: 'Proxy unreachable',
		description:
			'The proxy you supplied could not be reached. Check host, port, scheme and credentials.',
	},
	score_not_met: {
		message: 'Requested reCAPTCHA v3 score not met',
		description:
			'No token reaching the requested Min Score was obtained. Try a lower Min Score. Failed solves are never billed.',
	},
	unsolvable: {
		message: 'Captcha could not be solved',
		description:
			'The captcha was reported as unsolvable. Check the page URL, site key and parameters, then retry. Failed solves are never billed.',
	},
	capacity_unavailable: {
		message: 'Solving capacity temporarily unavailable',
		description: 'No solving capacity was available for this request. Retry shortly.',
	},
	rate_limited: {
		message: 'Rate limited by CaptchaNo',
		description:
			'Too many requests. Slow down (for example with a Wait node or by lowering batch size) and retry.',
	},
	task_not_found: {
		message: 'Task not found',
		description:
			'No task exists with this ID, or it has expired. Solutions can be retrieved for 10 minutes after solving.',
	},
	upstream_error: {
		message: 'Temporary solving error',
		description: 'A temporary error occurred in the solving infrastructure. Retry the request.',
	},
};

export function extractApiError(body: IDataObject | undefined): {
	code?: string;
	message?: string;
} {
	if (!body || typeof body !== 'object') return {};
	const err = body.error;
	if (err && typeof err === 'object') {
		const e = err as IDataObject;
		return {
			code: typeof e.code === 'string' ? e.code : undefined,
			message: typeof e.message === 'string' ? e.message : undefined,
		};
	}
	return {
		code: typeof body.code === 'string' ? body.code : undefined,
		message: typeof body.message === 'string' ? body.message : undefined,
	};
}

/**
 * Builds a NodeApiError with a clear, mapped message for a CaptchaNo error response.
 */
export function buildApiError(
	this: IExecuteFunctions,
	body: IDataObject | undefined,
	httpCode: number | undefined,
	itemIndex: number,
): NodeApiError {
	const { code, message } = extractApiError(body);
	const mapped = code ? ERROR_MESSAGES[code] : undefined;
	const apiDetail = message ? ` API said: ${message}` : '';
	return new NodeApiError(this.getNode(), (body ?? {}) as JsonObject, {
		message: mapped
			? `${mapped.message}${code ? ` (${code})` : ''}`
			: `CaptchaNo request failed${code ? ` (${code})` : ''}${httpCode ? ` [HTTP ${httpCode}]` : ''}`,
		description: `${mapped?.description ?? 'See https://captchano.com/captcha-solver-api for details.'}${apiDetail}`,
		httpCode: httpCode !== undefined ? String(httpCode) : undefined,
		itemIndex,
	});
}

function isTask(body: IDataObject | undefined): body is CaptchaNoTask {
	return (
		!!body &&
		typeof body.id === 'string' &&
		(body.status === 'solving' || body.status === 'ready' || body.status === 'failed')
	);
}

/**
 * Low-level authenticated request. Never throws on HTTP status; returns status + parsed body.
 * Network-level failures are wrapped in NodeApiError.
 */
export async function captchaNoRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	itemIndex: number,
	options: { body?: IDataObject; qs?: IDataObject; timeoutMs?: number } = {},
): Promise<CaptchaNoResponse> {
	const requestOptions: IHttpRequestOptions = {
		method,
		baseURL: CAPTCHANO_BASE_URL,
		url: path,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		headers: { Accept: 'application/json' },
		timeout: options.timeoutMs ?? 30000,
	};
	if (options.body) requestOptions.body = options.body;
	if (options.qs) requestOptions.qs = options.qs;

	let response: { statusCode: number; body: unknown };
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			requestOptions,
		)) as { statusCode: number; body: unknown };
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
	}

	let body: IDataObject = {};
	if (response.body && typeof response.body === 'object') {
		body = response.body as IDataObject;
	} else if (typeof response.body === 'string' && response.body.length > 0) {
		try {
			body = JSON.parse(response.body) as IDataObject;
		} catch {
			body = { raw: response.body };
		}
	}
	return { statusCode: response.statusCode, body };
}

/**
 * Returns the task when the response carries a task object (200 / 202 / 422 with task body),
 * otherwise throws a mapped NodeApiError.
 */
export function taskFromResponse(
	this: IExecuteFunctions,
	response: CaptchaNoResponse,
	itemIndex: number,
): CaptchaNoTask {
	const { statusCode, body } = response;
	if ((statusCode === 200 || statusCode === 202 || statusCode === 422) && isTask(body)) {
		return body;
	}
	throw buildApiError.call(this, body, statusCode, itemIndex);
}

/**
 * Adds convenience top-level fields (token / cookie / text) to the full task JSON.
 */
export function formatTask(task: CaptchaNoTask): IDataObject {
	const output: IDataObject = { ...task };
	const solution = task.solution;
	if (solution) {
		if (solution.token !== undefined) output.token = solution.token;
		if (solution.cookie !== undefined) output.cookie = solution.cookie;
		if (solution.text !== undefined) output.text = solution.text;
	}
	return output;
}

export async function getTask(
	this: IExecuteFunctions,
	taskId: string,
	itemIndex: number,
): Promise<CaptchaNoTask> {
	const response = await captchaNoRequest.call(
		this,
		'GET',
		`/v1/task/${encodeURIComponent(taskId)}`,
		itemIndex,
	);
	return taskFromResponse.call(this, response, itemIndex);
}

export async function getBalance(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const response = await captchaNoRequest.call(this, 'GET', '/v1/balance', itemIndex);
	if (response.statusCode === 200 && typeof response.body.balance === 'string') {
		return response.body;
	}
	throw buildApiError.call(this, response.body, response.statusCode, itemIndex);
}

/**
 * Submits a solve, blocking server-side for up to `waitSeconds`. If the task is still solving and
 * `pollUntilReady` is set, polls GET /v1/task/{id} every 5 s until it is ready, failed, or
 * `pollTimeoutSeconds` elapses. A failed task is returned as-is (status "failed"); the caller
 * decides whether to throw (failed solves are never billed).
 */
export async function solveCaptcha(
	this: IExecuteFunctions,
	payload: IDataObject,
	itemIndex: number,
	settings: { waitSeconds: number; pollUntilReady: boolean; pollTimeoutSeconds: number },
): Promise<CaptchaNoTask> {
	const wait = Math.max(0, Math.min(MAX_WAIT_SECONDS, Math.floor(settings.waitSeconds)));
	const response = await captchaNoRequest.call(this, 'POST', '/v1/solve', itemIndex, {
		body: payload,
		qs: wait > 0 ? { wait } : undefined,
		timeoutMs: (wait + 30) * 1000,
	});
	let task = taskFromResponse.call(this, response, itemIndex);

	if (task.status === 'solving' && settings.pollUntilReady) {
		const deadline = Date.now() + Math.max(0, settings.pollTimeoutSeconds) * 1000;
		while (task.status === 'solving' && Date.now() < deadline) {
			await sleep(POLL_INTERVAL_MS);
			task = await getTask.call(this, task.id, itemIndex);
		}
		if (task.status === 'solving') {
			throw new NodeOperationError(
				this.getNode(),
				`Captcha task ${task.id} is still solving after the poll timeout`,
				{
					itemIndex,
					description: `Increase "Poll Timeout" or fetch the result later with Captcha → Get Result using task ID ${task.id} (results are kept for 10 minutes).`,
				},
			);
		}
	}

	return task;
}
