import { aws_codebuild, aws_iam, Duration } from 'aws-cdk-lib';
import { BuildEnvironmentVariableType, BuildSpec, ComputeType, Project } from 'aws-cdk-lib/aws-codebuild';
import {
	ActionBindOptions,
	ActionCategory,
	ActionConfig,
	ActionProperties,
	CustomActionRegistration,
	IStage,
} from 'aws-cdk-lib/aws-codepipeline';
import { Action } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import { TriggerStrategy } from './strategies';
import { GitLabSourceActionProps, GitlabTrigger, TRIGGER_STRATEGIES } from './types';
import { validateHost, validateProjectPath } from './utils';

const VERSION = '7';

class GitLabSourceAction<T extends GitlabTrigger> extends Action {
	private readonly props: GitLabSourceActionProps<T>;
	private project?: Project;
	private triggerStrategy: TriggerStrategy;

	constructor(scope: Construct, trigger: T, props: GitLabSourceActionProps<T>) {
		super({
			...props,
			version: VERSION,
			actionName: 'GitLabSource',
			provider: 'GitLabSourceActionProvider',
			category: ActionCategory.SOURCE,
			owner: 'Custom',
			outputs: [props.output],
			artifactBounds: {
				minInputs: 0,
				maxInputs: 0,
				minOutputs: 1,
				maxOutputs: 1,
			},
		});

		this.props = props;
		validateHost(this.props.host);
		validateProjectPath(this.props.projectPath);

		this.triggerStrategy = this.selectTriggerStrategy(trigger);
		new CustomActionRegistration(scope, 'GitLabSourceActionRegistration', {
			category: ActionCategory.SOURCE,
			artifactBounds: {
				minInputs: 0,
				maxInputs: 0,
				minOutputs: 1,
				maxOutputs: 1,
			},
			provider: 'GitLabSourceActionProvider',
			version: VERSION,
			actionProperties: [
				{
					name: 'ProjectName',
					required: true,
					key: true,
					secret: false,
					type: 'String',
					description: 'Name of codebuild project',
				},
			],
		});
	}

	private selectTriggerStrategy(trigger: T): TriggerStrategy {
		const StrategyClass = TRIGGER_STRATEGIES[trigger];
		if (!StrategyClass) {
			throw new Error(`No strategy implemented for trigger type: ${trigger}`);
		}
		return new StrategyClass();
	}

	protected bound(scope: Construct, stage: IStage, options: ActionBindOptions): ActionConfig {
		this.triggerStrategy.createResources(scope, stage, this.props);
		// Updated CodeBuild project with artifact configuration.

		// Create a log group for the CodeBuild project
		const logGroup = new LogGroup(scope, `${this.props.actionName}-LogGroup`, {
			retention: RetentionDays.ONE_WEEK,
		});

		this.project = new Project(scope, `${this.props.actionName}-CodeBuildProject`, {
			projectName: `${this.props.actionName}-${this.props.branch}`,
			environment: {
				computeType: ComputeType.LAMBDA_2GB,
				buildImage: aws_codebuild.LinuxArmLambdaBuildImage.AMAZON_LINUX_2023_NODE_20,
			},
			buildSpec: BuildSpec.fromObject({
				version: '0.2',
				phases: {
					pre_build: {
						commands: [
							`echo "===== PIPELINE LOG: Starting repository clone ====="`,
							`echo "PIPELINE LOG: Cloning from GitLab ${this.props.host}${this.props.projectPath} from branch ${this.props.branch ?? 'main'}"`,
							`git clone --depth 1 --branch ${this.props.branch ?? 'main'} "https://oauth2:$GITLAB_TOKEN@${this.props.host}${this.props.projectPath}" source`,
							`cd source`,
							`ls -la`,
							`echo "PIPELINE LOG: Repository contents:"`,
							`find . -type f -not -path "*/\\.*" | sort | head -n 20`,
							`echo "PIPELINE LOG: $(find . -type f -not -path "*/\\.*" | wc -l) files found in repository"`,
							'echo "Successfully cloned repository"',
						],
					},
				},
				artifacts: {
					'base-directory': 'source',
					files: ['**/*'],
					'discard-paths': 'no',
				},
			}),
			environmentVariables: {
				GITLAB_TOKEN: {
					type: BuildEnvironmentVariableType.SECRETS_MANAGER,
					value: this.props.oauthToken.secretArn,
				},
			},
			logging: {
				cloudWatch: {
					enabled: true,
					logGroup: logGroup,
				},
			},
		});

		// the action needs to write the output to the pipeline bucket
		options.bucket.grantReadWrite(options.role);
		options.bucket.grantPutAcl(options.role);

		// allow the Project access to the Pipeline's artifact Bucket
		// but only if the project is not imported
		// (ie., has a role) - otherwise, the IAM library throws an error
		if (this.project.role) {
			if ((this.actionProperties.outputs || []).length > 0) {
				options.bucket.grantReadWrite(this.project);
			} else {
				options.bucket.grantRead(this.project);
			}
		}

		if (this.project instanceof aws_codebuild.Project) {
			this.project.bindToCodePipeline(scope, {
				artifactBucket: options.bucket,
			});
		}

		this.project.addToRolePolicy(
			new aws_iam.PolicyStatement({
				actions: [
					// CloudWatch Logs permissions for build logs
					'logs:CreateLogGroup',
					'logs:CreateLogStream',
					'logs:PutLogEvents',
				],
				resources: ['*'],
			}),
		);

		// Grant specific S3 permissions for artifact bucket
		this.project.addToRolePolicy(
			new aws_iam.PolicyStatement({
				actions: ['s3:PutObject', 's3:GetBucket*', 's3:GetObject*', 's3:List*'],
				resources: [options.bucket.bucketArn, `${options.bucket.bucketArn}/*`],
			}),
		);

		this.props.oauthToken.grantRead(this.project);

		const jobWorkerLambda = new Function(scope, 'JobWorkerLambda', {
			runtime: Runtime.NODEJS_20_X,
			handler: 'index.handler',
			code: Code.fromAsset(path.join(__dirname, './lambda/job-handler')),
			timeout: Duration.minutes(5),
			environment: {
				PROJECT_NAME: this.project.projectName,
				VERSION: VERSION,
				CODEPIPELINE_BUCKET_NAME: options.bucket.bucketName,
			},
		});

		// Replace the managed policies with a custom policy
		const jobWorkerPolicy = new aws_iam.Policy(scope, 'JobWorkerPolicy', {
			statements: [
				// CloudWatch Logs permissions
				new aws_iam.PolicyStatement({
					effect: aws_iam.Effect.ALLOW,
					actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
					resources: ['*'],
				}),
				// CodePipeline permissions - only what's needed
				new aws_iam.PolicyStatement({
					effect: aws_iam.Effect.ALLOW,
					actions: [
						'codepipeline:PollForJobs',
						'codepipeline:AcknowledgeJob',
						'codepipeline:PutJobSuccessResult',
						'codepipeline:PutJobFailureResult',
					],
					resources: ['*'],
				}),
				// CodeBuild permissions - only what's needed
				new aws_iam.PolicyStatement({
					effect: aws_iam.Effect.ALLOW,
					actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
					resources: [this.project.projectArn],
				}),
				// S3 permissions for artifacts
				new aws_iam.PolicyStatement({
					effect: aws_iam.Effect.ALLOW,
					actions: ['s3:GetObject', 's3:PutObject'],
					resources: [`${options.bucket.bucketArn}/*`],
				}),
			],
		});
		jobWorkerLambda.role?.attachInlinePolicy(jobWorkerPolicy);

		// Define the IAM policy for stopping the pipeline
		const stopPipelinePolicy = new aws_iam.Policy(scope, 'StopPipelinePolicy', {
			statements: [
				new aws_iam.PolicyStatement({
					effect: aws_iam.Effect.ALLOW,
					actions: ['codepipeline:StopPipelineExecution'],
					resources: [stage.pipeline.pipelineArn],
				}),
			],
		});

		jobWorkerLambda.role?.attachInlinePolicy(stopPipelinePolicy);

		const jobWorkerRule = new Rule(scope, 'JobworkerRule', {
			ruleName: `JobWorkerRule-${stage.pipeline.pipelineName}`,
			eventPattern: {
				source: ['aws.codepipeline'],
				detailType: ['CodePipeline Action Execution State Change'],
				detail: {
					pipeline: [stage.pipeline.pipelineName],
					stage: ['Source'],
					action: ['GitLabSource'],
					state: ['STARTED'],
				},
			},
			targets: [new LambdaFunction(jobWorkerLambda)],
			enabled: true,
			description: 'Poll for jobs in CodePipeline to start CodeBuild projects',
		});

		// Add a resource-based policy to the Lambda function
		jobWorkerLambda.addPermission('AllowCloudWatchEvents', {
			principal: new aws_iam.ServicePrincipal('events.amazonaws.com'),
			action: 'lambda:InvokeFunction',
			sourceArn: jobWorkerRule.ruleArn,
		});

		return {
			configuration: {
				ProjectName: this.project.projectName,
			},
		};
	}

	protected readonly providedActionProperties: ActionProperties = {
		artifactBounds: this.actionProperties.artifactBounds,
		actionName: this.actionProperties.actionName,
		category: ActionCategory.SOURCE,
		provider: 'GitLabSourceActionProvider',
		outputs: this.actionProperties.outputs,
		runOrder: this.actionProperties.runOrder,
		variablesNamespace: this.actionProperties.variablesNamespace,
	};
}

export { GitLabSourceAction };
