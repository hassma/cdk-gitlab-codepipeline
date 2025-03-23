/**
 * Custom error class for missing environment variables.
 */
class EnvironmentVariableError extends Error {
	constructor(variableName: string) {
		super(`${variableName} environment variable is not set`);
		this.name = 'EnvironmentVariableError';
	}
}

/**
 * Custom error class for job processing errors.
 */
class JobProcessingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'JobProcessingError';
	}
}

/**
 * Custom error class for job polling errors.
 */
class JobPollingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'JobPollingError';
	}
}

/**
 * Interface for retry options.
 */
interface RetryOptions {
	maxRetries: number;
	retryDelay?: number; // Made optional since we use baseDelay
	baseDelay?: number;
	onRetry?: (error: Error, attempt: number, maxAttempts: number) => void;
	shouldRetry?: (error: Error) => boolean;
	validateResult?: (result: any) => boolean;
}

/**
 * Type for console log levels
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Interface for CodePipeline event.
 */
interface CodePipelineEvent {
	version: string;
	id: string;
	'detail-type': string;
	source: string;
	account: string;
	time: string;
	region: string;
	resources: string[];
	detail: CodePipelineDetail;
}

/**
 * Interface for CodePipeline detail.
 */
interface CodePipelineDetail {
	pipeline: string;
	'execution-id': string;
	'start-time': string;
	stage: string;
	'action-execution-id': string;
	action: string;
	state: string;
	region: string;
	type: CodePipelineType;
	version: number;
	'pipeline-execution-attempt': number;
}

/**
 * Interface for CodePipeline type.
 */
interface CodePipelineType {
	owner: string;
	provider: string;
	category: string;
	version: string;
}

export {
	CodePipelineDetail,
	CodePipelineEvent,
	CodePipelineType,
	EnvironmentVariableError,
	JobPollingError,
	JobProcessingError,
	LogLevel,
	RetryOptions,
};
