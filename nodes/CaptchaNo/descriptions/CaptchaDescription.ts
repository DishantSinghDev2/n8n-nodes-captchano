import type { INodeProperties } from 'n8n-workflow';

const solveOnly = { resource: ['captcha'], operation: ['solve'] };

export const captchaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['captcha'],
			},
		},
		options: [
			{
				name: 'Solve',
				value: 'solve',
				description: 'Solve a captcha and return the token, cookie or text',
				action: 'Solve a captcha',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the status and solution of an existing captcha task',
				action: 'Get a captcha result',
			},
		],
		default: 'solve',
	},
];

export const captchaFields: INodeProperties[] = [
	/* -------------------------------------------------------------------------- */
	/*                                captcha:solve                               */
	/* -------------------------------------------------------------------------- */
	{
		displayName: 'Captcha Type',
		name: 'captchaType',
		type: 'options',
		required: true,
		displayOptions: { show: solveOnly },
		options: [
			{
				name: 'DataDome',
				value: 'datadome',
				description: 'DataDome challenge; returns a cookie. Requires a proxy.',
			},
			{
				name: 'Image',
				value: 'image',
				description: 'Image-to-text captcha; returns text',
			},
			{
				name: 'reCAPTCHA Enterprise',
				value: 'recaptcha_enterprise',
				description: 'Google reCAPTCHA Enterprise; returns a token',
			},
			{
				name: 'reCAPTCHA V2',
				value: 'recaptcha_v2',
				description: 'Google reCAPTCHA v2 (checkbox or invisible); returns a token',
			},
			{
				name: 'reCAPTCHA V3',
				value: 'recaptcha_v3',
				description: 'Google reCAPTCHA v3 (score based); returns a token',
			},
			{
				name: 'Turnstile',
				value: 'turnstile',
				description: 'Cloudflare Turnstile; returns a token',
			},
		],
		default: 'recaptcha_v2',
		description: 'The kind of captcha to solve',
	},
	{
		displayName: 'Page URL',
		name: 'url',
		type: 'string',
		required: true,
		displayOptions: {
			show: {
				...solveOnly,
				captchaType: [
					'recaptcha_v2',
					'recaptcha_v3',
					'recaptcha_enterprise',
					'turnstile',
					'datadome',
				],
			},
		},
		default: '',
		placeholder: 'https://example.com/login',
		description: 'Full URL of the page where the captcha appears',
	},
	{
		displayName: 'Site Key',
		name: 'sitekey',
		type: 'string',
		required: true,
		displayOptions: {
			show: {
				...solveOnly,
				captchaType: ['recaptcha_v2', 'recaptcha_v3', 'recaptcha_enterprise', 'turnstile'],
			},
		},
		default: '',
		placeholder: '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-',
		description:
			'The public site key of the captcha (the data-sitekey attribute, or the render= parameter for reCAPTCHA v3)',
	},
	{
		displayName: 'Challenge URL',
		name: 'challengeUrl',
		type: 'string',
		required: true,
		displayOptions: { show: { ...solveOnly, captchaType: ['datadome'] } },
		default: '',
		placeholder: 'https://geo.captcha-delivery.com/captcha/?initialCid=...',
		description: 'The full DataDome challenge (iframe) URL captured from the blocked page',
	},
	{
		displayName: 'Proxy',
		name: 'proxy',
		type: 'string',
		typeOptions: { password: true },
		required: true,
		displayOptions: { show: { ...solveOnly, captchaType: ['datadome'] } },
		default: '',
		placeholder: 'http://user:pass@host:port',
		description:
			'Proxy to solve through, as scheme://user:pass@host:port (http, socks4 or socks5). Required for DataDome; use the same IP your scraper uses.',
	},
	{
		displayName: 'Image Source',
		name: 'imageSource',
		type: 'options',
		displayOptions: { show: { ...solveOnly, captchaType: ['image'] } },
		options: [
			{
				name: 'Base64 String',
				value: 'base64',
			},
			{
				name: 'Binary File',
				value: 'binary',
			},
		],
		default: 'base64',
		description: 'Where to read the captcha image from',
	},
	{
		displayName: 'Image (Base64)',
		name: 'imageBody',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		displayOptions: { show: { ...solveOnly, captchaType: ['image'], imageSource: ['base64'] } },
		default: '',
		description: 'Base64-encoded image. A data: URL prefix is stripped automatically.',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		displayOptions: { show: { ...solveOnly, captchaType: ['image'], imageSource: ['binary'] } },
		default: 'data',
		hint: 'The name of the input binary field containing the captcha image',
		description: 'The name of the input binary field containing the captcha image',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: { show: solveOnly },
		default: {},
		options: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'string',
				displayOptions: {
					show: { '/captchaType': ['recaptcha_v3', 'recaptcha_enterprise', 'turnstile'] },
				},
				default: '',
				placeholder: 'login',
				description: 'The page action (reCAPTCHA v3/Enterprise action or Turnstile data-action)',
			},
			{
				displayName: 'cData',
				name: 'cData',
				type: 'string',
				displayOptions: { show: { '/captchaType': ['turnstile'] } },
				default: '',
				description: 'Turnstile data-cdata value, if the widget sets one',
			},
			{
				displayName: 'Invisible',
				name: 'invisible',
				type: 'boolean',
				displayOptions: { show: { '/captchaType': ['recaptcha_v2'] } },
				default: false,
				description: 'Whether the reCAPTCHA v2 widget is invisible',
			},
			{
				displayName: 'Min Score',
				name: 'minScore',
				type: 'number',
				typeOptions: { minValue: 0.1, maxValue: 0.9, numberPrecision: 1 },
				displayOptions: { show: { '/captchaType': ['recaptcha_v3'] } },
				default: 0.7,
				description: 'Minimum reCAPTCHA v3 score required (0.1–0.9)',
			},
			{
				displayName: 'Page Data',
				name: 'pageData',
				type: 'string',
				displayOptions: { show: { '/captchaType': ['turnstile'] } },
				default: '',
				description:
					'Turnstile challenge-page extras (chlPageData), when solving a Cloudflare challenge page',
			},
			{
				displayName: 'Proxy',
				name: 'proxy',
				type: 'string',
				typeOptions: { password: true },
				displayOptions: {
					show: {
						'/captchaType': ['recaptcha_v2', 'recaptcha_v3', 'recaptcha_enterprise', 'turnstile'],
					},
				},
				default: '',
				placeholder: 'http://user:pass@host:port',
				description:
					'Optional proxy to solve through, as scheme://user:pass@host:port (http, socks4 or socks5)',
			},
			{
				displayName: 'User Agent',
				name: 'userAgent',
				type: 'string',
				default: '',
				placeholder: 'Mozilla/5.0 ...',
				description: 'User-Agent the token or cookie will be used with',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: { show: solveOnly },
		default: {},
		options: [
			{
				displayName: 'Poll Timeout (Seconds)',
				name: 'pollTimeoutSeconds',
				type: 'number',
				typeOptions: { minValue: 5, maxValue: 600 },
				default: 180,
				description:
					'Maximum time to keep polling for the result after the initial wait, when Poll Until Ready is on',
			},
			{
				displayName: 'Poll Until Ready',
				name: 'pollUntilReady',
				type: 'boolean',
				default: true,
				description:
					'Whether to keep polling the task every 5 seconds if it is still solving after the initial wait. If off, the task is returned with status "solving" and you can fetch it later with Get Result.',
			},
			{
				displayName: 'Wait (Seconds)',
				name: 'waitSeconds',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 120 },
				default: 60,
				description:
					'How long the API holds the request open waiting for the solution (0–120). 0 returns immediately with a task ID.',
			},
		],
	},

	/* -------------------------------------------------------------------------- */
	/*                              captcha:getResult                             */
	/* -------------------------------------------------------------------------- */
	{
		displayName: 'Task ID',
		name: 'taskId',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['captcha'], operation: ['getResult'] } },
		default: '',
		description: 'The ID of a task returned by Solve. Results are kept for 10 minutes.',
	},
];
