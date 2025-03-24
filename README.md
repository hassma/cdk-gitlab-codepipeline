# AWS Pipeline Tools

[![Pull Request Checks](https://github.com/hassma/cdk-gitlab-codepipeline/actions/workflows/pr.yml/badge.svg?branch=main)](https://github.com/hassma/cdk-gitlab-codepipeline/actions/workflows/pr.yml) [![Release](https://github.com/hassma/cdk-gitlab-codepipeline/actions/workflows/release.yml/badge.svg)](https://github.com/hassma/cdk-gitlab-codepipeline/actions/workflows/release.yml)

A collection of AWS CDK constructs and custom actions that extend AWS CodePipeline capabilities, primarily focused on GitLab integration.

## Remarks

*The library is still in early development and will change quite frequently. So be aware of bugs.*

## Features

- GitLab Source Action for AWS CodePipeline
- Multiple trigger strategies:
    - Webhook-based triggering for automatic pipeline execution
    - Manual triggering for controlled deployments
- Secure OAuth token handling via AWS Secrets Manager
- Configurable branch selection
- Support for both GitLab Cloud and self-hosted instances

## Installation

```bash
npm install aws-pipeline-tools
# or
pnpm add aws-pipeline-tools
# or
yarn add aws-pipeline-tools
```

## Usage

### Basic Example

```typescript
import { GitLabSourceAction, GitlabTrigger } from 'cdk-gitlab-codepipeline';

// Create a GitLab source action with webhook trigger
new GitLabSourceAction(this, GitlabTrigger.WEBHOOK, {
	actionName: 'Source',
	output: sourceOutput,
	host: 'gitlab.com',
	projectPath: '/my-group/my-project',
	projectId: '12345', // Required for webhook trigger
	branch: 'main',
	oauthToken: secretsManager.Secret.fromSecretNameV2(this, 'GitLabToken', 'gitlab-token'),
});

// Create a GitLab source action without webhook (manual trigger)
new GitLabSourceAction(this, GitlabTrigger.NONE, {
	actionName: 'Source',
	output: sourceOutput,
	host: 'gitlab.com',
	projectPath: '/my-group/my-project',
	branch: 'main',
	oauthToken: secretsManager.Secret.fromSecretNameV2(this, 'GitLabToken', 'gitlab-token'),
});
```

### Required Permissions

The GitLab OAuth token needs the following permissions:

- Repository read access for cloning the code
- Webhook management (if using webhook trigger)

## Architecture

The integration works by:

1. Creating a custom source action in AWS CodePipeline
2. Using AWS CodeBuild to clone the GitLab repository
3. Implementing Lambda functions to handle webhook events and job processing
4. Managing pipeline artifacts in S3
5. Using EventBridge for orchestration

## API Reference

### GitLabSourceAction

Main class for creating a GitLab source action in AWS CodePipeline.

#### Properties

| Property    | Type     | Required         | Description                                      |
| ----------- | -------- | ---------------- | ------------------------------------------------ |
| host        | string   | Yes              | GitLab host (e.g., 'gitlab.com')                 |
| projectPath | string   | Yes              | Path to GitLab project (e.g., '/group/project')  |
| branch      | string   | Yes              | Branch to checkout                               |
| oauthToken  | ISecret  | Yes              | GitLab OAuth token stored in Secrets Manager     |
| output      | Artifact | Yes              | Output artifact for pipeline                     |
| projectId   | string   | Only for webhook | GitLab project ID (required for webhook trigger) |

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Format code
pnpm format
```

## Release Process

This project uses [release-please](https://github.com/googleapis/release-please) for version management and publishing. The release process is automated through GitHub Actions.

### How it works

1. Make changes and commit them using [Conventional Commits](https://www.conventionalcommits.org/) format:

    - `feat: add new feature` (bumps minor version)
    - `fix: resolve bug` (bumps patch version)
    - `feat!: ` or `fix!: ` or `refactor!: ` etc. (bumps major version)
    - `chore: update dependencies` (no version bump)

2. Push changes to the main branch. Release-please will:

    - Create/update a release PR
    - Update CHANGELOG.md
    - Bump version in package.json
    - Create GitHub releases

3. When the release PR is merged:
    - A new GitHub Release is created
    - The package is automatically published to npm

## License

MIT License

## Author

hassma
