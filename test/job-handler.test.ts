import { BatchGetBuildsCommand, CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import {
	AcknowledgeJobCommand,
	CodePipelineClient,
	PollForJobsCommand,
	PutJobSuccessResultCommand,
} from '@aws-sdk/client-codepipeline';
import { mockClient } from 'aws-sdk-client-mock';
import { jobHandler as handler } from '../src';
import { CodePipelineEvent } from '../src/types';

// Mock AWS services
const codeBuildMock = mockClient(CodeBuildClient);
const codePipelineMock = mockClient(CodePipelineClient);

describe('Job Handler Lambda Tests', () => {
	beforeEach(() => {
		// Reset all mocks before each test
		codeBuildMock.reset();
		codePipelineMock.reset();
		process.env.PROJECT_NAME = 'test-project';
		process.env.VERSION = '1.0.0';
	});

	it('validates required environment variables', async () => {
		delete process.env.PROJECT_NAME;

		const event: CodePipelineEvent = {
			version: '0',
			id: 'test-id',
			'detail-type': 'CodePipeline Action Execution State Change',
			source: 'aws.codepipeline',
			account: '123456789012',
			time: new Date().toISOString(),
			region: 'us-east-1',
			resources: [],
			detail: {
				pipeline: 'test-pipeline',
				'execution-id': 'test-execution',
				'action-execution-id': 'action-exec-id',
				'start-time': new Date().toISOString(),
				stage: 'Source',
				action: 'GitLabSource',
				state: 'STARTED',
				type: {
					owner: 'AWS',
					category: 'Source',
					provider: 'GitLabSourceActionProvider',
					version: '1',
				},
				region: 'us-east-1',
				version: 1,
				'pipeline-execution-attempt': 1,
			},
		};

		await expect(handler(event)).rejects.toThrow();
	});

	it('handles job polling error gracefully', async () => {
		// Mock polling error
		codePipelineMock.on(PollForJobsCommand).rejects(new Error('Polling error'));

		const event: CodePipelineEvent = {
			version: '0',
			id: 'test-id',
			'detail-type': 'CodePipeline Action Execution State Change',
			source: 'aws.codepipeline',
			account: '123456789012',
			time: new Date().toISOString(),
			region: 'us-east-1',
			resources: [],
			detail: {
				pipeline: 'test-pipeline',
				'execution-id': 'test-execution',
				'action-execution-id': 'action-exec-id',
				'start-time': new Date().toISOString(),
				stage: 'Source',
				action: 'GitLabSource',
				state: 'STARTED',
				type: {
					owner: 'AWS',
					category: 'Source',
					provider: 'GitLabSourceActionProvider',
					version: '1',
				},
				region: 'us-east-1',
				version: 1,
				'pipeline-execution-attempt': 1,
			},
		};

		await handler(event); // Should not throw
	});

	it('processes job successfully', async () => {
		// Mock successful job polling
		codePipelineMock.on(PollForJobsCommand).resolves({
			jobs: [
				{
					id: 'job-1',
					data: {
						actionConfiguration: {
							configuration: {
								ProjectName: 'test-project',
							},
						},
					},
				},
			],
		});

		// Mock successful build start and polling
		codeBuildMock.on(StartBuildCommand).resolves({
			build: {
				id: 'build-1',
				buildNumber: 1,
			},
		});

		codeBuildMock.on(BatchGetBuildsCommand).resolves({
			builds: [
				{
					id: 'build-1',
					buildNumber: 1,
					buildStatus: 'SUCCEEDED',
					currentPhase: 'COMPLETED',
				},
			],
		});

		// Mock successful job acknowledgement
		codePipelineMock.on(AcknowledgeJobCommand).resolves({
			status: 'InProgress',
		});

		// Mock successful job completion
		codePipelineMock.on(PutJobSuccessResultCommand).resolves({});

		const event: CodePipelineEvent = {
			version: '0',
			id: 'test-id',
			'detail-type': 'CodePipeline Action Execution State Change',
			source: 'aws.codepipeline',
			account: '123456789012',
			time: new Date().toISOString(),
			region: 'us-east-1',
			resources: [],
			detail: {
				pipeline: 'test-pipeline',
				'execution-id': 'test-execution',
				'action-execution-id': 'action-exec-id',
				'start-time': new Date().toISOString(),
				stage: 'Source',
				action: 'GitLabSource',
				state: 'STARTED',
				type: {
					owner: 'AWS',
					category: 'Source',
					provider: 'GitLabSourceActionProvider',
					version: '1',
				},
				region: 'us-east-1',
				version: 1,
				'pipeline-execution-attempt': 1,
			},
		};

		await handler(event);

		// Verify CodeBuild was started and status was checked
		expect(codeBuildMock.calls()).toHaveLength(2);

		// Verify job was completed successfully
		const putJobSuccessCalls = codePipelineMock.commandCalls(PutJobSuccessResultCommand);
		expect(putJobSuccessCalls).toHaveLength(1);
	});
});
