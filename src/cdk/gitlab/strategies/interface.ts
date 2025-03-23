import { IStage } from 'aws-cdk-lib/aws-codepipeline';
import { Construct } from 'constructs';
import { BaseGitLabSourceActionProps } from '../types';

/**
 * Strategy to create the trigger resources for the GitLab source action.
 */
interface TriggerStrategy {
	createResources(scope: Construct, stage: IStage, props: BaseGitLabSourceActionProps): void;
}

export { TriggerStrategy };
