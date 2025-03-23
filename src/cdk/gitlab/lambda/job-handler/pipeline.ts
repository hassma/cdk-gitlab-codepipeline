import {
	AcknowledgeJobCommand,
	CodePipelineClient,
	PollForJobsCommand,
	PollForJobsCommandInput,
	PollForJobsCommandOutput,
	PutJobFailureResultCommand,
	PutJobFailureResultCommandInput,
	PutJobSuccessResultCommand,
	StopPipelineExecutionCommand,
	StopPipelineExecutionCommandInput,
} from '@aws-sdk/client-codepipeline';
import { CodePipelineEvent } from './types';

/**
 * Handles interactions with AWS CodePipeline
 */
export class Pipeline {
	private codePipelineClient: CodePipelineClient;

	constructor() {
		this.codePipelineClient = new CodePipelineClient({});
	}

	/**
	 * Polls for jobs from CodePipeline
	 */
	async pollForJobs(pollForJobsParams: PollForJobsCommandInput): Promise<PollForJobsCommandOutput> {
		console.info(`Polling for jobs with parameters: ${JSON.stringify(pollForJobsParams, null, 2)}`);
		return await this.codePipelineClient.send(new PollForJobsCommand(pollForJobsParams));
	}

	/**
	 * Acknowledges a job from CodePipeline
	 * @param jobId The ID of the job to acknowledge
	 * @param nonce The nonce of the job to acknowledge
	 */
	async acknowledgeJob(jobId: string, nonce: string): Promise<void> {
		const acknowledgeJobParams = {
			jobId: jobId,
			nonce: nonce,
		};
		console.info(`Sending acknowledge job command for job: ${jobId}`);
		await this.codePipelineClient.send(new AcknowledgeJobCommand(acknowledgeJobParams));
	}

	/**
	 * Reports a job success to CodePipeline
	 * @param jobId The ID of the job to report success for
	 * @param buildId The ID of the build that succeeded
	 */
	async reportJobSuccess(jobId: string, buildId: string): Promise<void> {
		const putJobSuccessResultParams = new PutJobSuccessResultCommand({
			jobId: jobId,
			executionDetails: {
				summary: 'Successfully pulled source code from GitLab',
				externalExecutionId: buildId,
			},
			outputVariables: {
				BuildId: buildId,
			},
			currentRevision: {
				revision: buildId,
				changeIdentifier: 'CodeBuild',
			},
		});

		console.info(`Reporting job success for job: ${jobId} with build ID: ${buildId}`);
		await this.codePipelineClient.send(putJobSuccessResultParams);
	}

	/**
	 * Reports a job failure to CodePipeline
	 * @param jobId The ID of the job to report failure for
	 * @param message The error message to report
	 */
	async reportJobFailure(jobId: string, message: string): Promise<void> {
		const putJobFailureResultParams: PutJobFailureResultCommandInput = {
			jobId: jobId,
			failureDetails: {
				message: message,
				type: 'JobFailed',
			},
		};
		console.error(`Reporting job failure for job: ${jobId}: ${message}`);
		await this.codePipelineClient.send(new PutJobFailureResultCommand(putJobFailureResultParams));
	}

	/**
	 * Stops a pipeline execution
	 * @param event The CodePipeline event
	 * @param reason The reason for stopping the pipeline
	 */
	async stopPipeline(event: CodePipelineEvent, reason: string): Promise<void> {
		const stopPipelineParams: StopPipelineExecutionCommandInput = {
			pipelineName: event.detail.pipeline,
			pipelineExecutionId: event.detail['execution-id'],
			reason: reason,
			abandon: true,
		};

		const stopPipelineCommand = new StopPipelineExecutionCommand(stopPipelineParams);
		const stopResponse = await this.codePipelineClient.send(stopPipelineCommand);

		if (stopResponse.pipelineExecutionId) {
			console.info('Pipeline stopped successfully');
		}
	}
}
