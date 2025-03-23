import {
	CodePipelineClient,
	StartPipelineExecutionCommand,
	StartPipelineExecutionCommandInput,
} from '@aws-sdk/client-codepipeline';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GitlabPushEvent, HandlerEvent, HandlerResponse } from './types';

const secretsManager = new SecretsManagerClient({});
const codePipeline = new CodePipelineClient({});

const getGitlabToken = async (secretId: string): Promise<string | null> => {
	try {
		const secretResponse = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretId }));
		return secretResponse.SecretString || null;
	} catch (error: any) {
		console.error('Error retrieving secret:', error);
		return null;
	}
};

export const handler = async (
	event: HandlerEvent<string | GitlabPushEvent | { [key: string]: any }>,
): Promise<HandlerResponse> => {
	// Parse the event body
	event.body = JSON.parse(event.body as string) as GitlabPushEvent;

	const PIPELINE_NAME = process.env.PIPELINE_NAME;
	const X_GITLAB_TOKEN_ARN = process.env.X_GITLAB_TOKEN_ARN;
	const checks = [
		{
			value: PIPELINE_NAME,
			message: 'PIPELINE_NAME environment variable is required',
		},
		{
			value: X_GITLAB_TOKEN_ARN,
			message: 'X_GITLAB_TOKEN environment variable is required',
		},
		{
			value: event.headers['x-gitlab-token'],
			message: 'X-Gitlab-Token header is required',
		},
	];

	for (const check of checks) {
		if (!check.value) {
			return {
				statusCode: 400,
				body: JSON.stringify(check.message),
			};
		}
	}

	const eventToken = event.headers['x-gitlab-token'];
	const xGitlabToken = await getGitlabToken(X_GITLAB_TOKEN_ARN ?? '');

	if (!xGitlabToken) {
		return {
			statusCode: 400,
			body: JSON.stringify('X_GITLAB_TOKEN secret is required and could not be retrieved'),
		};
	}

	if (eventToken !== xGitlabToken) {
		return {
			statusCode: 401,
			body: JSON.stringify('Not Authorized'),
		};
	}

	try {
		const firstCommit = event.body.commits[0];
		console.log('[PIPELINE LOG] First commit:', JSON.stringify(firstCommit, null, 2));
		const params: StartPipelineExecutionCommandInput = {
			clientRequestToken: `webhook-${Date.now()}`,
			name: PIPELINE_NAME,

			variables: firstCommit
				? [
						{ name: 'BranchHash', value: event.body.before },
						{ name: 'CommitId', value: firstCommit.id },
						{
							name: 'CommitMessage',
							value: firstCommit.message.toString().replace(/\n/g, ' '),
						},
						{ name: 'CommitUrl', value: firstCommit.url },
						{ name: 'AuthorName', value: firstCommit.author.name },
						{ name: 'AuthorEmail', value: firstCommit.author.email },
					]
				: undefined,
		};

		const command = new StartPipelineExecutionCommand(params);
		console.log('[PIPELINE LOG] Starting pipeline with params:', JSON.stringify(params, null, 2));
		const response = await codePipeline.send(command);

		// Wait for the pipeline to start and get the job ID
		console.log('[PIPELINE LOG] Pipeline started with execution ID:', response.pipelineExecutionId);

		// Set output variables directly
		if (firstCommit) {
			const timestamp = new Date().toISOString();
			const host = process.env.GITLAB_HOST || 'unknown';
			const projectPath = process.env.PROJECT_PATH || 'unknown';
			const branch = process.env.BRANCH || 'main';

			console.log('[PIPELINE LOG] Setting output variables for the pipeline:');
			console.log(`[PIPELINE LOG] - Repository: ${host}${projectPath}`);
			console.log(`[PIPELINE LOG] - Branch: ${branch}`);
			console.log(`[PIPELINE LOG] - CommitId: ${firstCommit.id}`);
			console.log(`[PIPELINE LOG] - CommitMessage: ${firstCommit.message}`);
			console.log(`[PIPELINE LOG] - CommitUrl: ${firstCommit.url}`);
			console.log(`[PIPELINE LOG] - AuthorName: ${firstCommit.author.name}`);
			console.log(`[PIPELINE LOG] - AuthorEmail: ${firstCommit.author.email}`);
			console.log(`[PIPELINE LOG] - Timestamp: ${timestamp}`);
		}

		// Return success response with pipeline execution details
		return {
			statusCode: 200,
			body: JSON.stringify({
				message: `Pipeline ${PIPELINE_NAME} started successfully`,
				pipelineExecutionId: response.pipelineExecutionId,
				pipelineName: PIPELINE_NAME,
				timestamp: new Date().toISOString(),
				variables: params.variables,
			}),
		};
	} catch (error: any) {
		console.error('Error starting pipeline:', error);
		return {
			statusCode: 500,
			body: JSON.stringify(`Error starting pipeline ${PIPELINE_NAME}: ${error.message}`),
		};
	}
};
