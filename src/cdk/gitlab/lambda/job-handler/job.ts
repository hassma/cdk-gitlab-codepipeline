import {
	ArtifactPackaging,
	BatchGetBuildsCommand,
	CodeBuildClient,
	StartBuildCommand,
	StartBuildCommandInput,
} from '@aws-sdk/client-codebuild';
import { Job } from '@aws-sdk/client-codepipeline';
import { Pipeline } from './pipeline';
import { JobProcessingError } from './types';
import { formatDuration, logWithTimestamp, withRetry } from './utils';

/**
 * Handles CodeBuild job processing
 */
export class JobWorker {
	private codeBuildClient: CodeBuildClient;
	private pipeline: Pipeline;
	private readonly BUILD_POLL_INTERVAL = 4000; // 4 seconds
	private readonly MAX_BUILD_ATTEMPTS = 10; // 40 seconds total

	constructor() {
		this.codeBuildClient = new CodeBuildClient({});
		this.pipeline = new Pipeline();
	}

	/**
	 * Process a CodePipeline job
	 * @param job The job to process
	 * @param projectName The CodeBuild project name
	 */
	async processJob(job: Job, projectName: string): Promise<void> {
		const jobId = job.id!;
		const startTime = Date.now();

		try {
			logWithTimestamp('info', `Acknowledging job: ${jobId}`);
			await this.pipeline.acknowledgeJob(jobId, job.nonce!);

			logWithTimestamp('info', `Starting build for project: ${projectName}`);
			const startBuildResponse = await this.startBuild(projectName, job);
			const buildId = startBuildResponse.build?.id;

			if (!buildId) {
				throw new JobProcessingError('Build ID not returned from CodeBuild');
			}

			logWithTimestamp('info', 'Waiting for build to complete...');
			const buildSucceeded = await this.pollBuildStatus(buildId);
			const duration = formatDuration(Date.now() - startTime);

			if (buildSucceeded) {
				logWithTimestamp('debug', `Build succeeded after ${duration}`);
				await this.pipeline.reportJobSuccess(jobId, buildId);
				logWithTimestamp('info', `Successfully processed job: ${jobId}`);
			} else {
				throw new JobProcessingError(`Build failed or timed out after ${duration}`);
			}
		} catch (error: any) {
			const duration = formatDuration(Date.now() - startTime);
			logWithTimestamp('error', `Job failed after ${duration}:`, error);
			throw error;
		}
	}

	/**
	 * Starts a CodeBuild build
	 * @param projectName The name of the CodeBuild project
	 * @param job The CodePipeline job
	 */
	private async startBuild(projectName: string, job: Job) {
		const startBuildParams: StartBuildCommandInput = {
			projectName: projectName,
			logsConfigOverride: {
				cloudWatchLogs: {
					status: 'ENABLED',
				},
			},
		};

		// Configure artifacts if present
		if (job.data?.outputArtifacts && job.data.outputArtifacts.length > 0) {
			startBuildParams.artifactsOverride = {
				type: 'S3',
				location: job.data.outputArtifacts[0].location?.s3Location?.bucketName,
				...this.splitObjectKey(job.data.outputArtifacts[0].location?.s3Location?.objectKey),
				packaging: ArtifactPackaging.ZIP,
				namespaceType: 'NONE',
			};
		}

		logWithTimestamp('info', `Initiating repository pull for project: ${projectName}`);
		logWithTimestamp('debug', `Starting build with params:`, startBuildParams);

		return await this.codeBuildClient.send(new StartBuildCommand(startBuildParams));
	}

	/**
	 * Polls a CodeBuild build until completion with retries
	 * @param buildId The ID of the build to poll
	 */
	@withRetry({
		maxRetries: 10,
		baseDelay: 4000,
		shouldRetry: (error) => {
			// Always retry if the build is still in progress
			return (
				error.message === 'BUILD_IN_PROGRESS' ||
				error.name === 'ThrottlingException' ||
				error.name === 'ResourceNotFoundException'
			);
		},
	})
	private async pollBuildStatus(buildId: string): Promise<boolean> {
		const response = await this.codeBuildClient.send(new BatchGetBuildsCommand({ ids: [buildId] }));

		const build = response.builds?.[0];
		const status = build?.buildStatus;
		const phase = build?.currentPhase;

		logWithTimestamp('info', `Build ${buildId} status: ${status} (${phase})`);

		if (status === 'SUCCEEDED') {
			return true;
		}
		if (['FAILED', 'STOPPED', 'TIMED_OUT'].includes(status || '')) {
			return false;
		}

		// Only IN_PROGRESS should trigger a retry
		throw new Error('BUILD_IN_PROGRESS');
	}

	/**
	 * Splits an S3 object key into path and name components
	 * @param objectKey The full S3 object key
	 */
	private splitObjectKey(objectKey?: string) {
		const defaultName = 'output.zip';
		const parts = objectKey?.split('/') || [];
		const name = parts.pop() || defaultName;
		const path = parts.join('/');

		return { path, name };
	}
}
