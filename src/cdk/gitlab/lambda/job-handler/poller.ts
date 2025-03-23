import { PollForJobsCommandInput, PollForJobsCommandOutput } from '@aws-sdk/client-codepipeline';
import { Pipeline } from './pipeline';
import { JobPollingError } from './types';
import { logWithTimestamp, withRetry } from './utils';

/**
 * Job poller class with retry functionality
 */
export class JobPoller {
	constructor(private pipeline: Pipeline) {}

	@withRetry({
		maxRetries: 3,
		baseDelay: 1000,
		onRetry: (error: Error, attempt: number, maxAttempts: number) => {
			logWithTimestamp('warn', `Job polling attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
		},
		shouldRetry: (error) => error instanceof JobPollingError,
		validateResult: (result: PollForJobsCommandOutput) => {
			// Consider the result valid only if we have jobs
			if (!result?.jobs?.length) {
				throw new JobPollingError('No jobs available');
			}
			return true;
		},
	})
	async pollForJobs(pollForJobsParams: PollForJobsCommandInput) {
		logWithTimestamp('info', `Polling for jobs with parameters:`, pollForJobsParams);
		return await this.pipeline.pollForJobs(pollForJobsParams);
	}
}
