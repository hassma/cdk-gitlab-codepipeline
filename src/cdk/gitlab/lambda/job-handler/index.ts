import { PollForJobsCommandInput } from '@aws-sdk/client-codepipeline';
import { ErrorHandler } from './error';
import { JobWorker } from './job';
import { Pipeline } from './pipeline';
import { JobPoller } from './poller';
import { CodePipelineEvent, JobPollingError } from './types';
import { logWithTimestamp } from './utils';

// Initialize services
const pipeline = new Pipeline();
const jobWorker = new JobWorker();
const jobPoller = new JobPoller(pipeline);
const errorHandler = new ErrorHandler(pipeline);

/**
 * Lambda handler function for processing CodePipeline events
 */
export const handler = async (event: CodePipelineEvent) => {
	try {
		// Validate environment
		errorHandler.validateEnvVars(['PROJECT_NAME', 'VERSION']);
		const projectName = process.env.PROJECT_NAME!;

		// Poll for jobs
		const pollParams: PollForJobsCommandInput = {
			actionTypeId: {
				category: 'Source',
				owner: 'Custom',
				provider: 'GitLabSourceActionProvider',
				version: process.env.VERSION!,
			},
			maxBatchSize: 1,
		};

		const pollResponse = await jobPoller.pollForJobs(pollParams);
		logWithTimestamp('debug', 'Job polling response:', pollResponse);

		// Double-check for jobs even though poller should validate this
		if (!pollResponse?.jobs?.length) {
			throw new JobPollingError('No jobs available to process');
		}

		// Process the job
		const job = pollResponse.jobs[0];
		logWithTimestamp('info', `Processing job with ID: ${job.id}`);

		try {
			await jobWorker.processJob(job, projectName);
			logWithTimestamp('info', `Successfully completed job: ${job.id}`);
		} catch (error: any) {
			// Handle job processing failures (including build failures)
			await errorHandler.handleFailure(event, error, job.id);
			return;
		}
	} catch (error: any) {
    // Rethrow environment validation errors
    if (error.message?.includes('environment variable is not set')) {
      throw error;
    }
		if (error instanceof JobPollingError) {
			// For polling failures, just log and exit - don't try to stop pipeline
			await errorHandler.handleFailure(event, error, undefined, false);
			return;
		}

		// For other errors, try to stop pipeline but don't fail if it can't be stopped
		await errorHandler.handleFailure(event, error);
	}
};
