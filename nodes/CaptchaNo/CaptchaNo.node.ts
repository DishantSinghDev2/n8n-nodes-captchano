import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { captchaFields, captchaOperations } from './descriptions/CaptchaDescription';
import { accountOperations } from './descriptions/AccountDescription';
import {
	buildApiError,
	type CaptchaType,
	formatTask,
	getBalance,
	getTask,
	MAX_WAIT_SECONDS,
	solveCaptcha,
} from './GenericFunctions';

const SITEKEY_TYPES: CaptchaType[] = [
	'recaptcha_v2',
	'recaptcha_v3',
	'recaptcha_enterprise',
	'turnstile',
];

async function buildSolvePayload(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const type = this.getNodeParameter('captchaType', i) as CaptchaType;
	const payload: IDataObject = { type };

	if (type !== 'image') {
		payload.url = (this.getNodeParameter('url', i) as string).trim();
	}
	if (SITEKEY_TYPES.includes(type)) {
		payload.sitekey = (this.getNodeParameter('sitekey', i) as string).trim();
	}
	if (type === 'datadome') {
		payload.challengeUrl = (this.getNodeParameter('challengeUrl', i) as string).trim();
		const proxy = (this.getNodeParameter('proxy', i) as string).trim();
		if (!proxy) {
			throw new NodeOperationError(this.getNode(), 'A proxy is required for DataDome', {
				itemIndex: i,
				description: 'Use the format scheme://user:pass@host:port (http, socks4 or socks5).',
			});
		}
		payload.proxy = proxy;
	}
	if (type === 'image') {
		const source = this.getNodeParameter('imageSource', i) as 'base64' | 'binary';
		let base64: string;
		if (source === 'binary') {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			this.helpers.assertBinaryData(i, binaryPropertyName);
			const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
			base64 = buffer.toString('base64');
		} else {
			base64 = (this.getNodeParameter('imageBody', i) as string).trim();
			base64 = base64.replace(/^data:[^;]+;base64,/, '');
		}
		if (!base64) {
			throw new NodeOperationError(this.getNode(), 'The image is empty', { itemIndex: i });
		}
		payload.body = base64;
	}

	const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	if (typeof additional.action === 'string' && additional.action.trim()) {
		payload.action = additional.action.trim();
	}
	if (typeof additional.minScore === 'number' && type === 'recaptcha_v3') {
		payload.minScore = additional.minScore;
	}
	if (typeof additional.invisible === 'boolean' && type === 'recaptcha_v2') {
		payload.invisible = additional.invisible;
	}
	if (typeof additional.cData === 'string' && additional.cData.trim()) {
		payload.cData = additional.cData.trim();
	}
	if (typeof additional.pageData === 'string' && additional.pageData.trim()) {
		payload.pageData = additional.pageData.trim();
	}
	if (typeof additional.userAgent === 'string' && additional.userAgent.trim()) {
		payload.userAgent = additional.userAgent.trim();
	}
	if (type !== 'datadome' && typeof additional.proxy === 'string' && additional.proxy.trim()) {
		payload.proxy = additional.proxy.trim();
	}
	return payload;
}

export class CaptchaNo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CaptchaNo',
		name: 'captchaNo',
		icon: {
			light: 'file:captchano.svg',
			dark: 'file:captchano.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Solve reCAPTCHA v2/v3/Enterprise, Cloudflare Turnstile, DataDome and image captchas with CaptchaNo',
		defaults: {
			name: 'CaptchaNo',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'captchaNoApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Captcha',
						value: 'captcha',
					},
					{
						name: 'Account',
						value: 'account',
					},
				],
				default: 'captcha',
			},
			...captchaOperations,
			...captchaFields,
			...accountOperations,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'account' && operation === 'getBalance') {
					const balance = await getBalance.call(this, i);
					returnData.push({ json: balance, pairedItem: { item: i } });
					continue;
				}

				if (resource === 'captcha' && operation === 'getResult') {
					const taskId = (this.getNodeParameter('taskId', i) as string).trim();
					if (!taskId) {
						throw new NodeOperationError(this.getNode(), 'Task ID is required', { itemIndex: i });
					}
					const task = await getTask.call(this, taskId, i);
					returnData.push({ json: formatTask(task), pairedItem: { item: i } });
					continue;
				}

				if (resource === 'captcha' && operation === 'solve') {
					const payload = await buildSolvePayload.call(this, i);
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const waitSeconds = typeof options.waitSeconds === 'number' ? options.waitSeconds : 60;
					const pollUntilReady =
						typeof options.pollUntilReady === 'boolean' ? options.pollUntilReady : true;
					const pollTimeoutSeconds =
						typeof options.pollTimeoutSeconds === 'number' ? options.pollTimeoutSeconds : 180;

					const task = await solveCaptcha.call(this, payload, i, {
						waitSeconds: Math.min(waitSeconds, MAX_WAIT_SECONDS),
						pollUntilReady,
						pollTimeoutSeconds,
					});

					if (task.status === 'failed') {
						const apiError = buildApiError.call(this, task, 422, i);
						if (this.continueOnFail()) {
							returnData.push({
								json: {
									...formatTask(task),
									apiError: task.error,
									error: apiError.message,
									errorDescription: apiError.description ?? undefined,
								},
								pairedItem: { item: i },
							});
							continue;
						}
						throw apiError;
					}

					returnData.push({ json: formatTask(task), pairedItem: { item: i } });
					continue;
				}

				throw new NodeOperationError(
					this.getNode(),
					`Unsupported operation "${operation}" for resource "${resource}"`,
					{ itemIndex: i },
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							errorDescription: (error as { description?: string }).description ?? undefined,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				// Errors from the request helpers are already NodeApiError / NodeOperationError
				// carrying the item index; re-wrapping returns them unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
