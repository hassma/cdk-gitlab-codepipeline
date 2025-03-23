import { Artifact, CommonAwsActionProps } from 'aws-cdk-lib/aws-codepipeline';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { NoWebhookStrategy, TriggerStrategy, WebhookStrategy } from './strategies';
/**
 * The trigger configuration for the GitLab source action.
 *
 * - NONE: No trigger, Pipeline will be triggered manually
 * - WEBHOOK: Webhook will be created in the GitLab project
 */
enum GitlabTrigger {
	NONE = 'None', // Default
	WEBHOOK = 'WebHook', // Webhook
}

/**
 * Base properties for GitLab source action.
 */
interface BaseGitLabSourceActionProps extends CommonAwsActionProps {
	/**
	 * Hostname of the GitLab server
	 * Containing subdomains and domain with tld and optionally the port.
	 * Example: gitlab.com add port if needed
	 */
	readonly host: string;

	/**
	 * Path to the GitLab project
	 * Example: /group/project
	 */
	readonly projectPath: string;

	/**
	 * The branch to check out. If not specified, the default branch will be used.
	 */
	readonly branch: string;

	/**
	 * The OAuth token to use for authentication with GitLab.
	 * Reference a secret by name or by arn in Secrets Manager.
	 * Need to have the following permissions:
	 * - pull from the repository
	 */
	readonly oauthToken: ISecret;

	/**
	 * The output artifact where the source code will be stored.
	 */
	readonly output: Artifact;
}

type NoWebhookGitLabSourceActionProps = BaseGitLabSourceActionProps;

/**
 * Properties for the GitLab source Action.
 */
interface WebhookGitLabSourceActionProps extends BaseGitLabSourceActionProps {
	/**
	 * The ID of the GitLab project used for the API calls.
	 * Only needed for the Webhook strategy.
	 */
	readonly projectId: string;
}

/**
 * Properties for the GitLab source Action.
 * @typeparam T the trigger type
 * @see GitlabTrigger
 * @see BaseGitLabSourceActionProps
 * @see Webhook
 * @see NoWebhook
 */
type GitLabSourceActionProps<T extends GitlabTrigger> = T extends GitlabTrigger.WEBHOOK
	? WebhookGitLabSourceActionProps
	: NoWebhookGitLabSourceActionProps;

/**
 * Strategy registry mapping triggers to strategy implementations.
 * @see TriggerStrategy
 * @see WebhookStrategy
 * @see NoWebhookStrategy
 */
const TRIGGER_STRATEGIES: {
	[key in GitlabTrigger]: new () => TriggerStrategy;
} = {
	[GitlabTrigger.WEBHOOK]: WebhookStrategy,
	[GitlabTrigger.NONE]: NoWebhookStrategy,
};

export {
	BaseGitLabSourceActionProps,
	GitLabSourceActionProps,
	GitlabTrigger,
	NoWebhookGitLabSourceActionProps,
	TRIGGER_STRATEGIES,
	WebhookGitLabSourceActionProps,
};
