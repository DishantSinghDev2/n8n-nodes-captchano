import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CaptchaNoApi implements ICredentialType {
	name = 'captchaNoApi';

	displayName = 'CaptchaNo API';

	icon: Icon = {
		light: 'file:../nodes/CaptchaNo/captchano.svg',
		dark: 'file:../nodes/CaptchaNo/captchano.svg',
	};

	documentationUrl = 'https://captchano.com/captcha-solver-api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'cn-...',
			description:
				'Your CaptchaNo API key (starts with <code>cn-</code>). Create one at <a href="https://captchano.com/dashboard/keys" target="_blank">captchano.com/dashboard/keys</a>.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.captchano.com',
			url: '/v1/balance',
			method: 'GET',
		},
	};
}
