import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DeleteParameterCommand, GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

export enum RequestType {
	Create = 'Create',
	Update = 'Update',
	Delete = 'Delete',
}

export interface GitlabWebhookEvent {
	RequestType: RequestType;
	ResourceProperties: {
		gitlabUrl: string;
		projectId: string;
		branch: string;
		webhookUrl: string;
	};
}

export interface CustomResourceResponse {
	Status: string;
	PhysicalResourceId?: string;
	Reason?: string;
	Data?: any;
}

const apiPath = 'api/v4';
const secretsManager = new SecretsManagerClient({});
const parameterStore = new SSMClient({});

type CreateOrUpdateWebhookProps = {
	gitlabUrl: string;
	projectId: string;
	webhookUrl: string;
	gitlabPat: string;
	branch: string;
	validationToken: string;
	gitlabWebhookIdParameterName: string;
	requestType: RequestType;
};

const createOrUpdateWebhook = async (props: CreateOrUpdateWebhookProps): Promise<CustomResourceResponse> => {
	const {
		gitlabUrl,
		projectId,
		webhookUrl,
		gitlabPat,
		branch,
		validationToken,
		gitlabWebhookIdParameterName,
		requestType,
	} = props;

	let webhookId;
	let method = 'POST';
	let url = `${gitlabUrl}/projects/${projectId}/hooks`;

	if (requestType === 'Update') {
		const parameterResponse = await parameterStore.send(
			new GetParameterCommand({ Name: gitlabWebhookIdParameterName }),
		);
		webhookId = parameterResponse.Parameter?.Value;

		if (!webhookId) {
			return {
				Status: 'FAILED',
				Reason: 'Webhook ID not found in Parameter Store',
			};
		}

		method = 'PUT';
		url = `${gitlabUrl}/projects/${projectId}/hooks/${webhookId}`;
	}

	const response = await fetch(url, {
		method,
		headers: {
			'PRIVATE-TOKEN': gitlabPat,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			name: `aws-codepipeline-webhook-${branch}`,
			url: webhookUrl,
			push_events: true,
			merge_requests_events: true,
			push_events_branch_filter: branch,
			token: validationToken,
		}),
	});

	if (response.status === 201 || response.status === 200) {
		const responseData = await response.json();
		webhookId = responseData.id.toString();

		await parameterStore.send(
			new PutParameterCommand({
				Name: gitlabWebhookIdParameterName,
				Value: webhookId,
				Type: 'String',
				Overwrite: true,
			}),
		);

		return {
			Status: 'SUCCESS',
			PhysicalResourceId: `GitLabWebhook-${projectId}`,
			Data: responseData,
		};
	}

	return {
		Status: 'FAILED',
		Reason: await response.text(),
	};
};

type DeleteWebhookProps = {
	gitlabUrl: string;
	projectId: string;
	gitlabPat: string;
	gitlabWebhookIdParameterName: string;
};

const deleteWebhook = async (props: DeleteWebhookProps): Promise<CustomResourceResponse> => {
	const { gitlabUrl, projectId, gitlabPat, gitlabWebhookIdParameterName } = props;

	const parameterResponse = await parameterStore.send(
		new GetParameterCommand({ Name: gitlabWebhookIdParameterName }),
	);
	const webhookId = parameterResponse.Parameter?.Value;

	if (!webhookId) {
		return {
			Status: 'FAILED',
			Reason: 'Webhook ID not found in Parameter Store',
		};
	}

	const response = await fetch(`${gitlabUrl}/api/v4/projects/${projectId}/hooks/${webhookId}`, {
		method: 'DELETE',
		headers: {
			'PRIVATE-TOKEN': gitlabPat,
			'Content-Type': 'application/json',
		},
	});

	// Delete the webhook ID from Parameter Store
	await parameterStore.send(
		new DeleteParameterCommand({
			Name: gitlabWebhookIdParameterName,
		}),
	);

	if (response.status === 204) {
		return {
			Status: 'SUCCESS',
			PhysicalResourceId: `GitLabWebhook-${projectId}`,
		};
	}

	return {
		Status: 'FAILED',
		Reason: await response.text(),
	};
};

const checkNull = (value: any, name: string, projectId: string): CustomResourceResponse | null => {
	if (value == null) {
		return {
			PhysicalResourceId: `GitLabWebhook-${projectId}`,
			Status: 'FAILED',
			Reason: `${name} is required and could not be retrieved`,
		};
	}
	return null;
};

const fetchSecret = async (secretArn: string): Promise<string> => {
	const secret = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretArn }));
	if (!secret.SecretString) {
		throw new Error('Secret string is empty');
	}
	return secret.SecretString;
};

export const handler = async (event: GitlabWebhookEvent): Promise<CustomResourceResponse> => {
	try {
		const { RequestType: requestType, ResourceProperties } = event;
		const { gitlabUrl, projectId, branch, webhookUrl } = ResourceProperties;

		const gitlabApiUrl = `https://${gitlabUrl}/${apiPath}`;
		const gitlabToken = await fetchSecret(process.env.GITLAB_TOKEN!);
		const gitlabWebhookIdParameterName = process.env.GITLAB_WEBHOOK_PARAMETER_NAME!;

		// Validate required parameters
		const nullCheck = [
			[gitlabUrl, 'GITLAB_URL'],
			[projectId, 'PROJECT_ID'],
			[gitlabToken, 'GITLAB_TOKEN'],
		].find(([value]) => value == null);

		if (nullCheck) {
			return checkNull(null, nullCheck[1] as string, projectId)!;
		}

		if (requestType === RequestType.Create || requestType === RequestType.Update) {
			if (!gitlabApiUrl || !branch || !webhookUrl) {
				return {
					PhysicalResourceId: `GitLabWebhook-${projectId}`,
					Status: 'FAILED',
					Reason: 'Missing required properties for create/update operation',
				};
			}

			const xGitlabToken = await fetchSecret(process.env.X_GITLAB_TOKEN!);

			return await createOrUpdateWebhook({
				gitlabUrl: gitlabApiUrl,
				projectId,
				webhookUrl,
				branch,
				validationToken: xGitlabToken,
				gitlabWebhookIdParameterName,
				gitlabPat: gitlabToken,
				requestType: requestType,
			});
		}

		if (requestType === RequestType.Delete) {
			return await deleteWebhook({
				gitlabUrl: gitlabApiUrl,
				projectId,
				gitlabPat: gitlabToken,
				gitlabWebhookIdParameterName,
			});
		}

		return {
			Status: 'SUCCESS',
			PhysicalResourceId: `GitLabWebhook-${projectId}`,
		};
	} catch (error: any) {
		return {
			Status: 'FAILED',
			Reason: error.message,
			PhysicalResourceId: `GitLabWebhook-${event.ResourceProperties.projectId}`,
		};
	}
};
