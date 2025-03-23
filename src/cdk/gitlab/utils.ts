/**
 * Validate host name
 * - host must be a valid domain name
 * - Example: gitlab.com
 * @param host
 */

function validateHost(host: string): void {
	const hostRegex = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;
	if (!hostRegex.test(host)) {
		throw new Error('Invalid host');
	}
}

/**
 * Validate project path
 * @param projectPath The path to the GitLab project in the form /group/project
 */
function validateProjectPath(projectPath: string): void {
	const projectPathRegex = /^\/[a-zA-Z0-9_\/.-]+$/;
	if (!projectPathRegex.test(projectPath) || projectPath.endsWith('.git')) {
		throw new Error('Invalid project path');
	}
}

export { validateHost, validateProjectPath };
