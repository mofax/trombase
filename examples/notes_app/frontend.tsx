/// <reference lib="dom" />
import qs from "qs";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DbId } from "../../src/db/dbid";

type Note = {
	id: string;
	title: string;
	content: string;
	userId: string;
};

type Session = {
	id: string;
	userId: string;
	token: string;
	expiresAt: number;
};

type User = {
	id: string;
	email: string;
};

function getStoredSession(): Session | null {
	const raw = localStorage.getItem("session");
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (
			typeof parsed.id === "string" &&
			typeof parsed.userId === "string" &&
			typeof parsed.token === "string" &&
			typeof parsed.expiresAt === "number"
		) {
			return parsed;
		}
	} catch {
		// ignore
	}
	return null;
}

function setStoredSession(session: Session | null) {
	if (session) {
		localStorage.setItem("session", JSON.stringify(session));
	} else {
		localStorage.removeItem("session");
	}
}

function getStoredUser(): User | null {
	const raw = localStorage.getItem("user");
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed.id === "string" && typeof parsed.email === "string") {
			return parsed;
		}
	} catch {
		// ignore
	}
	return null;
}

function setStoredUser(user: User | null) {
	if (user) {
		localStorage.setItem("user", JSON.stringify(user));
	} else {
		localStorage.removeItem("user");
	}
}

function isSessionActive(session: Session | null): session is Session {
	return session !== null && session.expiresAt > Date.now();
}

function authHeaders(token: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"x-session-token": token,
	};
}

function apiError(data: unknown, fallback: string): string {
	if (typeof data === "object" && data !== null) {
		const message = (data as Record<string, unknown>).message;
		if (typeof message === "string") {
			return message;
		}
	}
	return fallback;
}

function parseAuthResponse(data: unknown): { user: User; session: Session } | null {
	if (typeof data !== "object" || data === null) {
		return null;
	}
	const record = data as Record<string, unknown>;
	const user = record.user;
	const session = record.session;
	if (
		typeof user !== "object" ||
		user === null ||
		typeof session !== "object" ||
		session === null
	) {
		return null;
	}
	const userRecord = user as Record<string, unknown>;
	const sessionRecord = session as Record<string, unknown>;
	if (
		typeof userRecord.id === "string" &&
		typeof userRecord.email === "string" &&
		typeof sessionRecord.id === "string" &&
		typeof sessionRecord.userId === "string" &&
		typeof sessionRecord.token === "string" &&
		typeof sessionRecord.expiresAt === "number"
	) {
		return {
			user: { id: userRecord.id, email: userRecord.email },
			session: {
				id: sessionRecord.id,
				userId: sessionRecord.userId,
				token: sessionRecord.token,
				expiresAt: sessionRecord.expiresAt,
			},
		};
	}
	return null;
}

async function fetchNotes(session: Session): Promise<Note[]> {
	const query = qs.stringify({
		action: {
			table: "notes",
			where: { userId: session.userId },
			orderBy: [{ field: "createdAt", direction: "desc" }],
		},
	});
	const res = await fetch(`/api/db/select?${query}`, {
		method: "GET",
		headers: authHeaders(session.token),
	});
	const data = await res.json();
	if (!res.ok) {
		throw new Error(apiError(data, "Failed to load notes"));
	}
	return data as Note[];
}

async function runMutations(session: Session, actions: unknown[]): Promise<void> {
	const res = await fetch("/api/db/mutations", {
		method: "POST",
		headers: authHeaders(session.token),
		body: JSON.stringify(actions),
	});
	const data = await res.json();
	if (!res.ok) {
		throw new Error(apiError(data, "Mutation failed"));
	}
}

function App() {
	const storedSession = getStoredSession();
	const [view, setView] = useState<"login" | "register" | "notes">(
		isSessionActive(storedSession) ? "notes" : "login",
	);
	const [session, setSession] = useState<Session | null>(storedSession);
	const [user, setUser] = useState<User | null>(getStoredUser);
	const [notes, setNotes] = useState<Note[]>([]);
	const [message, setMessage] = useState<string>("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		setStoredSession(session);
	}, [session]);

	useEffect(() => {
		setStoredUser(user);
	}, [user]);

	const showMessage = useCallback((msg: string) => {
		setMessage(msg);
		setTimeout(() => setMessage(""), 4000);
	}, []);

	const loadNotes = useCallback(
		async (activeSession: Session) => {
			setLoading(true);
			try {
				const rows = await fetchNotes(activeSession);
				setNotes(rows);
			} catch (error) {
				showMessage(error instanceof Error ? error.message : "Failed to load notes");
			} finally {
				setLoading(false);
			}
		},
		[showMessage],
	);

	useEffect(() => {
		if (!isSessionActive(session)) {
			if (session) {
				setSession(null);
				setUser(null);
				setNotes([]);
				setView("login");
			}
			return;
		}
		loadNotes(session);
	}, [session, loadNotes]);

	const handleRegister = useCallback(
		async (email: string, password: string) => {
			setLoading(true);
			try {
				const res = await fetch("/api/auth/register", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email, password }),
				});
				const data = await res.json();
				if (!res.ok) {
					showMessage(apiError(data, "Registration failed"));
					return;
				}
				const auth = parseAuthResponse(data);
				if (!auth) {
					showMessage("Registration failed");
					return;
				}
				setUser(auth.user);
				setSession(auth.session);
				setView("notes");
				showMessage("Registered successfully");
			} catch {
				showMessage("Registration failed");
			} finally {
				setLoading(false);
			}
		},
		[showMessage],
	);

	const handleLogin = useCallback(
		async (email: string, password: string) => {
			setLoading(true);
			try {
				const res = await fetch("/api/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email, password }),
				});
				const data = await res.json();
				if (!res.ok) {
					showMessage(apiError(data, "Login failed"));
					return;
				}
				const auth = parseAuthResponse(data);
				if (!auth) {
					showMessage("Login failed");
					return;
				}
				setUser(auth.user);
				setSession(auth.session);
				setView("notes");
				showMessage("Logged in successfully");
			} catch {
				showMessage("Login failed");
			} finally {
				setLoading(false);
			}
		},
		[showMessage],
	);

	const handleLogout = useCallback(async () => {
		if (!session) return;
		setLoading(true);
		try {
			await fetch("/api/auth/logout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token: session.token }),
			});
		} catch {
			// ignore
		} finally {
			setSession(null);
			setUser(null);
			setNotes([]);
			setView("login");
			setLoading(false);
		}
	}, [session]);

	const handleCreateNote = useCallback(
		async (title: string, content: string) => {
			if (!session || !user) return;
			setLoading(true);
			try {
				await runMutations(session, [
					{
						table: "notes",
						action: "insert",
						payload: {
							id: DbId.init().toString(),
							title,
							content,
							userId: session.userId,
						},
					},
				]);
				await loadNotes(session);
			} catch (error) {
				showMessage(error instanceof Error ? error.message : "Failed to create note");
			} finally {
				setLoading(false);
			}
		},
		[session, user, showMessage, loadNotes],
	);

	const handleUpdateNote = useCallback(
		async (id: string, title: string, content: string) => {
			if (!session) return;
			setLoading(true);
			try {
				await runMutations(session, [
					{
						table: "notes",
						action: "update",
						id,
						payload: { title, content },
					},
				]);
				await loadNotes(session);
			} catch (error) {
				showMessage(error instanceof Error ? error.message : "Failed to update note");
			} finally {
				setLoading(false);
			}
		},
		[session, showMessage, loadNotes],
	);

	const handleDeleteNote = useCallback(
		async (id: string) => {
			if (!session) return;
			setLoading(true);
			try {
				await runMutations(session, [
					{
						table: "notes",
						action: "delete",
						id,
					},
				]);
				await loadNotes(session);
			} catch (error) {
				showMessage(error instanceof Error ? error.message : "Failed to delete note");
			} finally {
				setLoading(false);
			}
		},
		[session, showMessage, loadNotes],
	);

	return (
		<div style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
			<h1>TromBase Notes</h1>
			{message && (
				<div
					style={{
						padding: 12,
						marginBottom: 16,
						background: "#ffebee",
						color: "#c62828",
						borderRadius: 4,
					}}
				>
					{message}
				</div>
			)}
			{view === "login" && (
				<LoginView onLogin={handleLogin} onSwitch={() => setView("register")} loading={loading} />
			)}
			{view === "register" && (
				<RegisterView
					onRegister={handleRegister}
					onSwitch={() => setView("login")}
					loading={loading}
				/>
			)}
			{view === "notes" && (
				<NotesView
					user={user}
					notes={notes}
					onLogout={handleLogout}
					onCreate={handleCreateNote}
					onUpdate={handleUpdateNote}
					onDelete={handleDeleteNote}
					loading={loading}
				/>
			)}
		</div>
	);
}

function LoginView(props: {
	onLogin: (email: string, password: string) => Promise<void>;
	onSwitch: () => void;
	loading: boolean;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	return (
		<div>
			<h2>Login</h2>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					props.onLogin(email, password);
				}}
			>
				<div style={{ marginBottom: 12 }}>
					<input
						type="email"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.currentTarget.value)}
						required
						style={{ width: "100%", padding: 8 }}
					/>
				</div>
				<div style={{ marginBottom: 12 }}>
					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.currentTarget.value)}
						required
						style={{ width: "100%", padding: 8 }}
					/>
				</div>
				<button type="submit" disabled={props.loading} style={{ padding: "8px 16px" }}>
					{props.loading ? "Loading..." : "Login"}
				</button>
			</form>
			<p>
				No account?{" "}
				<button
					onClick={props.onSwitch}
					style={{ background: "none", border: "none", color: "#1976d2", cursor: "pointer" }}
				>
					Register
				</button>
			</p>
		</div>
	);
}

function RegisterView(props: {
	onRegister: (email: string, password: string) => Promise<void>;
	onSwitch: () => void;
	loading: boolean;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	return (
		<div>
			<h2>Register</h2>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					props.onRegister(email, password);
				}}
			>
				<div style={{ marginBottom: 12 }}>
					<input
						type="email"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.currentTarget.value)}
						required
						style={{ width: "100%", padding: 8 }}
					/>
				</div>
				<div style={{ marginBottom: 12 }}>
					<input
						type="password"
						placeholder="Password (min 8 chars)"
						value={password}
						onChange={(e) => setPassword(e.currentTarget.value)}
						required
						style={{ width: "100%", padding: 8 }}
					/>
				</div>
				<button type="submit" disabled={props.loading} style={{ padding: "8px 16px" }}>
					{props.loading ? "Loading..." : "Register"}
				</button>
			</form>
			<p>
				Already have an account?{" "}
				<button
					onClick={props.onSwitch}
					style={{ background: "none", border: "none", color: "#1976d2", cursor: "pointer" }}
				>
					Login
				</button>
			</p>
		</div>
	);
}

function NotesView(props: {
	user: User | null;
	notes: Note[];
	onLogout: () => Promise<void>;
	onCreate: (title: string, content: string) => Promise<void>;
	onUpdate: (id: string, title: string, content: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
	loading: boolean;
}) {
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [editContent, setEditContent] = useState("");

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<h2>Notes</h2>
				<button onClick={props.onLogout} disabled={props.loading} style={{ padding: "8px 16px" }}>
					Logout
				</button>
			</div>
			{props.user && (
				<p style={{ color: "#666" }}>
					Logged in as <strong>{props.user.email}</strong>
				</p>
			)}
			<div style={{ marginBottom: 24, padding: 16, background: "#f5f5f5", borderRadius: 4 }}>
				<h3>Create Note</h3>
				<div style={{ marginBottom: 8 }}>
					<input
						type="text"
						placeholder="Title"
						value={title}
						onChange={(e) => setTitle(e.currentTarget.value)}
						style={{ width: "100%", padding: 8 }}
					/>
				</div>
				<div style={{ marginBottom: 8 }}>
					<textarea
						placeholder="Content"
						value={content}
						onChange={(e) => setContent(e.currentTarget.value)}
						rows={4}
						style={{ width: "100%", padding: 8 }}
					/>
				</div>
				<button
					onClick={() => {
						props.onCreate(title, content).then(() => {
							setTitle("");
							setContent("");
						});
					}}
					disabled={props.loading || !title}
					style={{ padding: "8px 16px" }}
				>
					{props.loading ? "Saving..." : "Create Note"}
				</button>
			</div>
			{props.notes.length === 0 && <p>No notes yet.</p>}
			{props.notes.map((note) => (
				<div
					key={note.id}
					style={{
						marginBottom: 16,
						padding: 16,
						border: "1px solid #ddd",
						borderRadius: 4,
					}}
				>
					{editingId === note.id ? (
						<div>
							<div style={{ marginBottom: 8 }}>
								<input
									type="text"
									value={editTitle}
									onChange={(e) => setEditTitle(e.currentTarget.value)}
									style={{ width: "100%", padding: 8 }}
								/>
							</div>
							<div style={{ marginBottom: 8 }}>
								<textarea
									value={editContent}
									onChange={(e) => setEditContent(e.currentTarget.value)}
									rows={4}
									style={{ width: "100%", padding: 8 }}
								/>
							</div>
							<button
								onClick={() => {
									props.onUpdate(note.id, editTitle, editContent).then(() => {
										setEditingId(null);
									});
								}}
								disabled={props.loading}
								style={{ padding: "8px 16px", marginRight: 8 }}
							>
								Save
							</button>
							<button onClick={() => setEditingId(null)} style={{ padding: "8px 16px" }}>
								Cancel
							</button>
						</div>
					) : (
						<div>
							<h4 style={{ margin: "0 0 8px" }}>{note.title}</h4>
							<p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{note.content}</p>
							<button
								onClick={() => {
									setEditingId(note.id);
									setEditTitle(note.title);
									setEditContent(note.content);
								}}
								disabled={props.loading}
								style={{ padding: "4px 12px", marginRight: 8 }}
							>
								Edit
							</button>
							<button
								onClick={() => props.onDelete(note.id)}
								disabled={props.loading}
								style={{ padding: "4px 12px", color: "#c62828" }}
							>
								Delete
							</button>
						</div>
					)}
				</div>
			))}
		</div>
	);
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);
