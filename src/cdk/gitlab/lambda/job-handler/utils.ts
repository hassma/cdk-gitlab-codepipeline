import { LogLevel, RetryOptions } from './types';

/**
 * Retry decorator function for retrying operations with exponential backoff
 * @param options Retry configuration options
 */
export function withRetry(options: RetryOptions) {
	return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		const maxAttempts = options.maxRetries;
		const baseDelay = options.baseDelay || 1000;

		descriptor.value = async function (...args: any[]) {
			let attempt = 1;
			let lastError: Error | undefined;

			for (attempt = 1; attempt <= maxAttempts; attempt++) {
				try {
					logWithTimestamp('info', `Attempt ${attempt}/${maxAttempts}`);
					const result = await originalMethod.apply(this, args);

					// Allow the caller to determine if the result is valid
					if (options.validateResult && !options.validateResult(result)) {
						throw new Error('Invalid result');
					}

					return result;
				} catch (error: any) {
					lastError = error;
					const isRetryableErrorType = options.shouldRetry ? options.shouldRetry(error) : true;
					const isLastAttempt = attempt >= maxAttempts;

					if (!isRetryableErrorType || isLastAttempt) {
						const reason = !isRetryableErrorType ? 'non-retryable error type' : 'max attempts reached';
						logWithTimestamp('warn', `Not retrying (${reason}): ${error.message}`);
						throw error;
					}

					options.onRetry?.(error, attempt, maxAttempts);

					const jitter = Math.floor(Math.random() * 300);
					const backoffDelay = Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, 30000);

					logWithTimestamp(
						'info',
						`Waiting ${Math.round(backoffDelay)}ms before attempt ${attempt + 1}/${maxAttempts}`,
					);
					await new Promise((resolve) => setTimeout(resolve, backoffDelay));
				}
			}

			throw lastError || new Error(`Failed after ${maxAttempts} attempts`);
		};

		return descriptor;
	};
}

/**
 * Debug function to log PollForJobs command details
 */
export const debugPollForJobs = async (pollParams: any, event: any, response: any) => {
	logWithTimestamp('debug', 'Received event:', event);
	logWithTimestamp('debug', 'PollForJobs parameters:', pollParams);
	logWithTimestamp('debug', 'PollForJobs response:', response);
};

/**
 * Validates that required environment variables are set
 */
export const validateEnvVars = (envVars: string[]): void => {
	envVars.forEach((variableName) => {
		if (!process.env[variableName]) {
			throw new Error(`${variableName} environment variable is not set`);
		}
	});
};

/**
 * Logs a timestamped message with consistent formatting
 */
export const logWithTimestamp = (level: LogLevel, message: string, ...args: any[]): void => {
	const timestamp = new Date().toISOString();
	const logFn = console[level] as (...args: any[]) => void;

	if (args.length > 0) {
		logFn(`[${timestamp}] ${message}`, ...args);
	} else {
		logFn(`[${timestamp}] ${message}`);
	}
};

/**
 * Formats a duration in milliseconds to a human-readable string
 */
export const formatDuration = (ms: number): string => {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};

/**
 * Creates an error handler that ensures errors are logged and wrapped appropriately
 */
export const createErrorHandler = (context: string) => {
	return (error: Error): never => {
		logWithTimestamp('error', `${context} failed:`, error);
		throw error;
	};
};
