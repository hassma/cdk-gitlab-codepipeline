import { CodePipelineClient, StartPipelineExecutionCommand } from '@aws-sdk/client-codepipeline';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import { GitlabPushEvent, webhookHandler as handler, HandlerEvent } from '../src';

// Mock AWS services
const codePipelineMock = mockClient(CodePipelineClient);
const secretsManagerMock = mockClient(SecretsManagerClient);

describe('Webhook Lambda Tests', () => {
	beforeEach(() => {
		// Reset all mocks before each test
		codePipelineMock.reset();
		secretsManagerMock.reset();
		process.env.PIPELINE_NAME = 'test-pipeline';
		process.env.X_GITLAB_TOKEN_ARN = 'arn:aws:secretsmanager:region:account:secret:test-token';
	});

	it('validates required environment variables', async () => {
		delete process.env.PIPELINE_NAME;

		const event: HandlerEvent<string> = {
			body: JSON.stringify({ commits: [] }),
			headers: { 'x-gitlab-token': 'test-token' },
		};

		const result = await handler(event);
		expect(result.statusCode).toBe(400);
		expect(result.body).toBe(JSON.stringify('PIPELINE_NAME environment variable is required'));
	});

	it('validates webhook token', async () => {
		// Mock secret retrieval
		secretsManagerMock.on(GetSecretValueCommand).resolves({
			SecretString: 'correct-token',
		});

		const event: HandlerEvent<string> = {
			body: JSON.stringify({ commits: [] }),
			headers: { 'x-gitlab-token': 'wrong-token' },
		};

		const result = await handler(event);
		expect(result.statusCode).toBe(401);
		expect(result.body).toBe(JSON.stringify('Not Authorized'));
	});

	it('successfully starts pipeline execution', async () => {
		const mockCommit = {
			id: 'abc123',
			message: 'test commit',
			url: 'http://gitlab.com/commit/abc123',
			author: {
				name: 'Test User',
				email: 'test@example.com',
			},
		};

		// Mock secret retrieval
		secretsManagerMock.on(GetSecretValueCommand).resolves({
			SecretString: 'test-token',
		});

		// Mock pipeline start
		codePipelineMock.on(StartPipelineExecutionCommand).resolves({
			pipelineExecutionId: 'exec-123',
		});

		const event: HandlerEvent<string> = {
			body: JSON.stringify({
				commits: [mockCommit],
				before: 'def456',
			} as GitlabPushEvent),
			headers: { 'x-gitlab-token': 'test-token' },
		};

		const result = await handler(event);
		expect(result.statusCode).toBe(200);

		const body = JSON.parse(result.body);
		expect(body.pipelineExecutionId).toBe('exec-123');
		expect(body.pipelineName).toBe('test-pipeline');
	});

	it('handles pipeline start failure', async () => {
		// Mock secret retrieval
		secretsManagerMock.on(GetSecretValueCommand).resolves({
			SecretString: 'test-token',
		});

		// Mock pipeline start failure
		codePipelineMock.on(StartPipelineExecutionCommand).rejects(new Error('Pipeline error'));

		const event: HandlerEvent<string> = {
			body: JSON.stringify({
				commits: [{ id: 'abc123', message: 'test' }],
				before: 'def456',
			} as GitlabPushEvent),
			headers: { 'x-gitlab-token': 'test-token' },
		};

		const result = await handler(event);
		expect(result.statusCode).toBe(500);
		expect(result.body).toContain('Error starting pipeline');
	});
});
