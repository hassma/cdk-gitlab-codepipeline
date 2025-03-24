// Export type definitions explicitly
export type {
	// Core Types
	BaseGitLabSourceActionProps,
	GitLabSourceActionProps,
	GitlabTrigger,
	NoWebhookGitLabSourceActionProps,
	WebhookGitLabSourceActionProps,
} from './cdk/gitlab/types';

// Lambda Handler Types
export type { CodePipelineEvent, CustomResourceResponse, GitlabWebhookEvent } from './cdk/gitlab';

export type { GenericEvent, GitlabPushEvent, HandlerEvent, HandlerResponse } from './cdk/gitlab';

// Strategy Types
export type { TriggerStrategy } from './cdk/gitlab';
