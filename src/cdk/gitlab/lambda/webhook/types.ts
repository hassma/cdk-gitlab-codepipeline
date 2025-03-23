// Define a generic event type.
type GenericEvent = { [key: string]: any };

// Define an interface for the expected structure of the event.
interface HandlerEvent<T = GenericEvent> {
	headers: { [key: string]: string };
	body: T;
	[key: string]: any;
}

// Define an interface for the expected GitLab push event structure.
interface GitlabPushEvent {
	before: string;
	commits: Array<{
		id: string;
		message: string;
		url: string;
		author: {
			name: string;
			email: string;
		};
	}>;
	[key: string]: any;
}

// Define an interface for the expected structure of the response.
interface HandlerResponse {
	statusCode: number;
	body: string;
}

export { GenericEvent, GitlabPushEvent, HandlerEvent, HandlerResponse };
