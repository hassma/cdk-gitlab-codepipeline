// Main Action Class
export { GitLabSourceAction } from './source-action';

// Core Types
export {
	BaseGitLabSourceActionProps,
	GitLabSourceActionProps,
	GitlabTrigger,
	NoWebhookGitLabSourceActionProps,
	WebhookGitLabSourceActionProps,
} from './types';

// Strategy Exports
export { NoWebhookStrategy, TriggerStrategy, WebhookStrategy } from './strategies';

// Lambda Handler Types
export type { CustomResourceResponse, GitlabWebhookEvent, RequestType } from './lambda/cr-handler';

export type { GenericEvent, GitlabPushEvent, HandlerEvent, HandlerResponse } from './lambda/webhook/types';

// Lambda Handlers
export { handler as crHandler } from './lambda/cr-handler';

export { handler as webhookHandler } from './lambda/webhook';

// Internal Registry (not exported)
export { TRIGGER_STRATEGIES } from './types';
