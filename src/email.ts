export type EmailMessage = {
	from?: string | string[];
	to: string | string[];
	subject: string;
	html: string;
	attachments?: File[];
};

export type EmailSender = (message: EmailMessage) => Promise<void> | void;

export async function stdoutEmailSender(message: EmailMessage): Promise<void> {
	const output = {
		from: message.from,
		to: message.to,
		subject: message.subject,
		html: message.html,
		attachments: message.attachments?.length ?? 0,
	};

	console.log("[trombase:email]", output);
}
