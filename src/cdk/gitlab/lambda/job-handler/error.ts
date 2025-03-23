import { Pipeline } from './pipeline';
import { CodePipelineEvent, JobPollingError, JobProcessingError } from './types';
import { logWithTimestamp } from './utils';

/**
 * Handles job failures by stopping the pipeline and reporting failures
 */
export class ErrorHandler {
	constructor(private pipeline: Pipeline) {}

	/**
	 * Handles a failure by stopping the pipeline and reporting job failure
	 * @param event The CodePipeline event
	 * @param error The error that occurred
	 * @param jobId Optional job ID for reporting job failure
	 * @param shouldStopPipeline Whether to attempt to stop the pipeline
	 */
	async handleFailure(
		event: CodePipelineEvent,
		error: Error,
		jobId?: string,
		shouldStopPipeline = true,
	): Promise<void> {
		logWithTimestamp('error', 'Error processing event:', error);
		logWithTimestamp('debug', `Error type: ${error.constructor.name}`);

		try {
			const reason = `Job failed: ${error.message}`;

			// Only try to stop pipeline for non-polling errors and when explicitly requested
			if (shouldStopPipeline && !(error instanceof JobPollingError)) {
				try {
					await this.pipeline.stopPipeline(event, reason);
					logWithTimestamp('warn', 'Pipeline stopped due to error');
				} catch (stopError: any) {
					// Log but don't fail if pipeline can't be stopped
					logWithTimestamp('warn', 'Could not stop pipeline:', stopError);
				}
			}

			// Report job failure if we have a job ID
			if (jobId) {
				await this.pipeline.reportJobFailure(jobId, reason);
				logWithTimestamp('info', `Reported failure for job: ${jobId}`);
			}
		} catch (reportError: any) {
			logWithTimestamp('error', 'Failed to handle failure:', reportError);
			throw new JobProcessingError(
				`Failed to handle failure: ${reportError.message}. Original error: ${error.message}`,
			);
		}
	}

	/**
	 * Validates required environment variables
	 * @param variables List of required environment variables
	 */
	validateEnvVars(variables: string[]): void {
		variables.forEach((varName) => {
			if (!process.env[varName]) {
				throw new Error(`${varName} environment variable is not set`);
			}
		});
	}
}
