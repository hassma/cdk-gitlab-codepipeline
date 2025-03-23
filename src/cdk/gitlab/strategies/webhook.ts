import { CustomResource } from 'aws-cdk-lib';
import { IStage } from 'aws-cdk-lib/aws-codepipeline';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Code, Function, FunctionUrl, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';
import { WebhookGitLabSourceActionProps } from '../types';
import { TriggerStrategy } from './interface';

/**
 * Strategy implementation for the Webhook trigger.
 */
class WebhookStrategy implements TriggerStrategy {
	private webhook: Function;
	private webhookUrl: FunctionUrl;
	private gitlabWebhookRegistrationHandler: Function;
	private gitlabWebhookRegistrationProvider: Provider;
	private gitlabWebhookSecret: Secret;
	private gitlabWebhookIdParameter: string = 'GitLabWebhookId';

	createResources(scope: Construct, stage: IStage, props: WebhookGitLabSourceActionProps): void {
		// Create the Secrets Manager secret
		this.gitlabWebhookSecret = new Secret(scope, 'GitLabWebhookSecret', {
			secretName: 'GitLabWebhookSecret',
		});

		this.webhook = new Function(scope, 'WebhookLambda', {
			runtime: Runtime.NODEJS_18_X,
			handler: 'index.handler',
			code: Code.fromAsset(path.join(__dirname, '../lambda/webhook')),
			functionName: 'PipelineWebhook',
			environment: {
				PIPELINE_NAME: stage.pipeline.pipelineName,
				X_GITLAB_TOKEN_ARN: this.gitlabWebhookSecret.secretArn,
			},
		});

		this.gitlabWebhookSecret.grantRead(this.webhook);

		// Grant the Lambda function permission to invoke the codepipeline
		const pipelineStartPolicy = new PolicyStatement({
			actions: ['codepipeline:StartPipelineExecution'],
			resources: [stage.pipeline.pipelineArn],
		});

		this.webhook.addToRolePolicy(pipelineStartPolicy);

		// Create the webhook URL
		this.webhookUrl = this.webhook.addFunctionUrl({
			authType: FunctionUrlAuthType.NONE,
		});

		// Environment variables for the GitLab webhook registration handler
		const environment = {
			GITLAB_WEBHOOK_PARAMETER_NAME: this.gitlabWebhookIdParameter,
			GITLAB_TOKEN: props.oauthToken.secretArn,
			X_GITLAB_TOKEN: this.gitlabWebhookSecret.secretArn,
		};

		// Create the Lambda function
		this.gitlabWebhookRegistrationHandler = new Function(scope, 'GitLabWebhookHandler', {
			runtime: Runtime.NODEJS_18_X,
			handler: 'index.handler',
			code: Code.fromAsset(path.join(__dirname, '../lambda/cr-handler')),
			environment: environment,
		});

		this.gitlabWebhookSecret.grantRead(this.gitlabWebhookRegistrationHandler);
		props.oauthToken.grantRead(this.gitlabWebhookRegistrationHandler);

		// Create the custom resource provider
		this.gitlabWebhookRegistrationProvider = new Provider(scope, 'GitLabWebhookProvider', {
			onEventHandler: this.gitlabWebhookRegistrationHandler,
		});

		// Custom resource properties
		const customResourceProperties = {
			gitlabUrl: props.host,
			projectId: props.projectId,
			branch: props.branch,
			webhookUrl: this.webhookUrl.url,
		};

		// Create the custom resource for webhook creation
		const gitlabWebhookRegistrationCR = new CustomResource(scope, 'GitLabWebhookResource', {
			serviceToken: this.gitlabWebhookRegistrationProvider.serviceToken,
			properties: customResourceProperties,
		});
	}
}

export { WebhookStrategy };
