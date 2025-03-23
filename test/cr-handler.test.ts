import { handler, RequestType } from '@actions/cdk/gitlab/lambda/cr-handler';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DeleteParameterCommand, GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';

// Mock AWS services
const secretsManagerMock = mockClient(SecretsManagerClient);
const ssmMock = mockClient(SSMClient);

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Custom Resource Handler Lambda Tests', () => {
	beforeEach(() => {
		// Reset all mocks before each test
		secretsManagerMock.reset();
		ssmMock.reset();
		mockFetch.mockReset();

		// Set up environment variables
		process.env.GITLAB_TOKEN = 'gitlab-token-secret-arn';
		process.env.GITLAB_WEBHOOK_PARAMETER_NAME = '/gitlab/webhook-id';
	});

	it('creates webhook successfully', async () => {
		// Mock secrets manager response
		secretsManagerMock.on(GetSecretValueCommand).resolves({
			SecretString: 'test-gitlab-token',
		});

		// Mock webhook creation response
		mockFetch.mockResolvedValueOnce({
			status: 201,
			json: async () => ({ id: 'webhook-123' }),
		});

		// Mock SSM parameter store
		ssmMock.on(PutParameterCommand).resolves({});

		const event = {
			RequestType: RequestType.Create,
			ResourceProperties: {
				gitlabUrl: 'gitlab.example.com',
				projectId: '12345',
				branch: 'main',
				webhookUrl: 'https://webhook.example.com',
			},
		};

		const response = await handler(event);

		expect(response.Status).toBe('SUCCESS');
		expect(response.PhysicalResourceId).toBe('GitLabWebhook-12345');
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('updates webhook successfully', async () => {
		// Mock secrets manager response
		secretsManagerMock.on(GetSecretValueCommand).resolves({
			SecretString: 'test-gitlab-token',
		});

		// Mock getting existing webhook ID
		ssmMock.on(GetParameterCommand).resolves({
			Parameter: { Value: 'webhook-123' },
		});

		// Mock webhook update response
		mockFetch.mockResolvedValueOnce({
			status: 200,
			json: async () => ({ id: 'webhook-123' }),
		});

		const event = {
			RequestType: RequestType.Update,
			ResourceProperties: {
				gitlabUrl: 'gitlab.example.com',
				projectId: '12345',
				branch: 'main',
				webhookUrl: 'https://webhook.example.com',
			},
		};

		const response = await handler(event);

		expect(response.Status).toBe('SUCCESS');
		expect(response.PhysicalResourceId).toBe('GitLabWebhook-12345');
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('deletes webhook successfully', async () => {
		// Mock secrets manager response
		secretsManagerMock.on(GetSecretValueCommand).resolves({
			SecretString: 'test-gitlab-token',
		});

		// Mock getting existing webhook ID
		ssmMock.on(GetParameterCommand).resolves({
			Parameter: { Value: 'webhook-123' },
		});

		// Mock webhook deletion response
		mockFetch.mockResolvedValueOnce({
			status: 204,
		});

		// Mock parameter deletion
		ssmMock.on(DeleteParameterCommand).resolves({});

		const event = {
			RequestType: RequestType.Delete,
			ResourceProperties: {
				gitlabUrl: 'gitlab.example.com',
				projectId: '12345',
				branch: 'main',
				webhookUrl: 'https://webhook.example.com',
			},
		};

		const response = await handler(event);

		expect(response.Status).toBe('SUCCESS');
		expect(response.PhysicalResourceId).toBe('GitLabWebhook-12345');
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('handles webhook creation failure', async () => {
		// Mock secrets manager response
		secretsManagerMock.on(GetSecretValueCommand).resolves({
			SecretString: 'test-gitlab-token',
		});

		// Mock webhook creation failure
		mockFetch.mockResolvedValueOnce({
			status: 400,
			text: async () => 'Invalid request',
		});

		const event = {
			RequestType: RequestType.Create,
			ResourceProperties: {
				gitlabUrl: 'gitlab.example.com',
				projectId: '12345',
				branch: 'main',
				webhookUrl: 'https://webhook.example.com',
			},
		};

		const response = await handler(event);

		expect(response.Status).toBe('FAILED');
		expect(response.Reason).toBe('Invalid request');
	});
});
