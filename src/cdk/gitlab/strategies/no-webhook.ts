import { IStage } from 'aws-cdk-lib/aws-codepipeline';
import { Construct } from 'constructs';
import { NoWebhookGitLabSourceActionProps } from '../types';
import { TriggerStrategy } from './interface';

/**
 * Strategy for the NoWebhook trigger.
 */
class NoWebhookStrategy implements TriggerStrategy {
	createResources(_scope: Construct, _stage: IStage, _props: NoWebhookGitLabSourceActionProps): void {
		// No webhook resources to create
	}
}

export { NoWebhookStrategy };
