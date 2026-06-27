/**
 * confirm-dialog.ts — Three-way confirmation dialog for toolgate.
 *
 * Replaces the simple yes/no confirm with a richer dialog that lets
 * the user: approve (y), deny (n), or deny with a typed reason (r).
 *
 * Rendered as a non-overlay custom component (like questionnaire), so the
 * dialog appears in the normal message area rather than as a floating
 * overlay.  This matches the positioning of ctx.ui.confirm() used by the
 * old toolgate, but with fully customisable content and three options.
 *
 * Used by toolgate's "ask" flow so that when a tool requires approval,
 * the user can provide context for why they're rejecting it.
 */

import type { Component } from "@earendil-works/pi-tui";
import { matchesKey, Key } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Callbacks ────────────────────────────────────────────────────────────

export interface ConfirmWithReasonCallbacks {
	/** User pressed y/Y — approve the tool call. */
	onApprove: () => void;
	/** User pressed n/N or Escape — deny without a reason. */
	onDeny: () => void;
	/** User pressed r/R, typed a reason, and pressed Enter. */
	onRejectWithReason: (reason: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Word-wrap a string to fit within `maxWidth`.
 * Lines that are already short are kept as-is; longer lines are split
 * at word boundaries where possible (greedy fill, no hyphenation).
 */
function wordWrap(text: string, maxWidth: number): string[] {
	if (maxWidth <= 0) return text.split("\n");

	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		if (paragraph.length <= maxWidth) {
			lines.push(paragraph);
			continue;
		}

		const words = paragraph.split(" ");
		let currentLine = "";

		for (const word of words) {
			// If a single word is longer than maxWidth, it stays on its own line.
			if (currentLine.length === 0) {
				if (word.length <= maxWidth) {
					currentLine = word;
				} else {
					// Extra-long word — push it whole (no mid-word break).
					lines.push(word);
					currentLine = "";
				}
				continue;
			}

			const candidate = currentLine + " " + word;
			if (candidate.length <= maxWidth) {
				currentLine = candidate;
			} else {
				lines.push(currentLine);
				// Restart with the new word (handle it being > maxWidth).
				if (word.length <= maxWidth) {
					currentLine = word;
				} else {
					lines.push(word);
					currentLine = "";
				}
			}
		}

		if (currentLine.length > 0) lines.push(currentLine);
	}

	return lines;
}

// ── Component ────────────────────────────────────────────────────────────

export class ConfirmWithReasonDialog implements Component {
	private mode: "options" | "reason" = "options";
	private reasonBuffer = "";
	private cursorPos = 0;

	// Render cache
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private readonly title: string,
		private readonly message: string,
		private readonly theme: Theme,
		private readonly callbacks: ConfirmWithReasonCallbacks,
	) {}

	// ── Component interface ─────────────────────────────────────────────

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedWidth === width && this.cachedLines) {
			return this.cachedLines;
		}

		const lines = this.buildRender(width);
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	handleInput(data: string): void {
		if (this.mode === "options") {
			this.handleOptionsInput(data);
		} else {
			this.handleReasonInput(data);
		}
	}

	// ── Input dispatch ──────────────────────────────────────────────────

	private handleOptionsInput(data: string): void {
		if (matchesKey(data, "y")) {
			this.callbacks.onApprove();
		} else if (matchesKey(data, "n")) {
			this.callbacks.onDeny();
		} else if (matchesKey(data, "r")) {
			this.mode = "reason";
			this.reasonBuffer = "";
			this.cursorPos = 0;
			this.invalidate();
		} else if (matchesKey(data, Key.escape)) {
			this.callbacks.onDeny();
		}
		// All other input is silently ignored in options mode.
	}

	private handleReasonInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			// Go back to options mode without confirming.
			this.mode = "options";
			this.reasonBuffer = "";
			this.cursorPos = 0;
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.enter)) {
			const reason = this.reasonBuffer.trim();
			if (reason.length > 0) {
				this.callbacks.onRejectWithReason(reason);
			} else {
				// Empty reason — treat as plain deny.
				this.callbacks.onDeny();
			}
			return;
		}

		if (matchesKey(data, Key.backspace)) {
			if (this.cursorPos > 0) {
				this.reasonBuffer =
					this.reasonBuffer.slice(0, this.cursorPos - 1) +
					this.reasonBuffer.slice(this.cursorPos);
				this.cursorPos--;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.left)) {
			if (this.cursorPos > 0) {
				this.cursorPos--;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.right)) {
			if (this.cursorPos < this.reasonBuffer.length) {
				this.cursorPos++;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.home)) {
			if (this.cursorPos !== 0) {
				this.cursorPos = 0;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.end)) {
			const len = this.reasonBuffer.length;
			if (this.cursorPos !== len) {
				this.cursorPos = len;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.delete)) {
			if (this.cursorPos < this.reasonBuffer.length) {
				this.reasonBuffer =
					this.reasonBuffer.slice(0, this.cursorPos) +
					this.reasonBuffer.slice(this.cursorPos + 1);
				this.invalidate();
			}
			return;
		}

		// Accept printable characters (single code point, not a control/escape seq).
		if (this.isPrintable(data)) {
			this.reasonBuffer =
				this.reasonBuffer.slice(0, this.cursorPos) +
				data +
				this.reasonBuffer.slice(this.cursorPos);
			this.cursorPos += data.length;
			this.invalidate();
		}
	}

	/** Accept input that is a visible character (not a control/escape sequence). */
	private isPrintable(data: string): boolean {
		if (data.length === 0) return false;
		// Filter out ANSI escape sequences and C0 control characters.
		if (data.startsWith("\x1b")) return false;
		for (let i = 0; i < data.length; i++) {
			const code = data.charCodeAt(i);
			// Allow space (0x20) and above, but reject DEL (0x7F).
			if (code < 0x20 || code === 0x7f) return false;
		}
		return true;
	}

	// ── Render building ─────────────────────────────────────────────────

	private buildRender(termWidth: number): string[] {
		const { theme, title, message } = this;

		// Full-width display — the component receives the terminal width
		// from the non-overlay custom render path, same as questionnaire.
		const padX = 2; // left/right padding inside content area
		const contentWidth = Math.max(20, termWidth - padX * 2);

		// Word-wrap the message.
		const wrappedMessage = wordWrap(message, contentWidth);

		// Build the lines array.
		const lines: string[] = [];

		// ── Top separator ───────────────────────────────────────────────
		lines.push(theme.fg("accent", "─".repeat(termWidth)));

		// ── Title line ──────────────────────────────────────────────────
		const titleStyled = theme.fg("accent", theme.bold(title));
		lines.push(this.padLeft(titleStyled, padX));

		lines.push(""); // spacer

		// ── Message lines ───────────────────────────────────────────────
		for (const msgLine of wrappedMessage) {
			lines.push(this.padLeft(theme.fg("text", msgLine), padX));
		}

		lines.push(""); // spacer

		// ── Options or reason input ─────────────────────────────────────
		if (this.mode === "options") {
			lines.push(...this.buildOptionsLines(padX));
		} else {
			lines.push(...this.buildReasonLines(termWidth, padX));
		}

		// ── Bottom separator ────────────────────────────────────────────
		lines.push(theme.fg("accent", "─".repeat(termWidth)));

		return lines;
	}

	private buildOptionsLines(padX: number): string[] {
		const { theme } = this;

		const keyY = theme.fg("accent", "y");
		const keyN = theme.fg("accent", "n");
		const keyR = theme.fg("accent", "r");

		const opts: string[] = [
			`[${keyY}] ${theme.fg("text", "Approve — allow this tool call")}`,
			`[${keyN}] ${theme.fg("text", "Deny — block without explanation")}`,
			`[${keyR}] ${theme.fg("text", "Reject with reason — block and explain why")}`,
		];

		return opts.map((opt) => this.padLeft(opt, padX));
	}

	private buildReasonLines(termWidth: number, padX: number): string[] {
		const { theme } = this;

		const prefix = " ".repeat(padX);
		const promptLabel = "Reason: ";
		// Available space for the reason text after label and padding.
		const labelAndPadWidth = padX + promptLabel.length;
		const reasonAreaWidth = termWidth - labelAndPadWidth;

		const visibleReason = this.reasonBuffer;
		const visibleCursor = this.cursorPos;

		// If the reason is long, we display a viewport that keeps the cursor visible.
		let displayChunk: string;
		let adjustedCursor: number;

		if (visibleReason.length <= reasonAreaWidth) {
			displayChunk = visibleReason;
			adjustedCursor = visibleCursor;
		} else {
			let windowStart = 0;
			if (visibleCursor > reasonAreaWidth - 1) {
				windowStart = visibleCursor - reasonAreaWidth + 1;
			}
			if (windowStart < 0) windowStart = 0;
			const windowEnd = windowStart + reasonAreaWidth;
			displayChunk = visibleReason.slice(windowStart, windowEnd);
			adjustedCursor = visibleCursor - windowStart;
		}

		// Pad the display chunk to fill the reason area.
		const paddedChunk = displayChunk.padEnd(reasonAreaWidth, " ");

		// Build the line with cursor indicator.
		let reasonLine = prefix + promptLabel;
		for (let i = 0; i < paddedChunk.length; i++) {
			if (i === adjustedCursor) {
				const charToShow = paddedChunk[i] === " " ? " " : paddedChunk[i];
				reasonLine += theme.inverse(charToShow);
			} else {
				reasonLine += theme.fg("text", paddedChunk[i]);
			}
		}
		if (adjustedCursor >= paddedChunk.length) {
			reasonLine += theme.inverse(" ");
		}

		const hintText = "Enter to confirm · Esc to go back";
		const hintLine = this.padLeft(theme.fg("dim", hintText), padX);

		return [reasonLine, hintLine];
	}

	// ── Layout helpers ──────────────────────────────────────────────────

	private padLeft(content: string, padX: number): string {
		return " ".repeat(padX) + content;
	}
}

// ── Convenience function ─────────────────────────────────────────────────

/**
 * Show a three-way confirmation dialog as a non-overlay custom component.
 *
 * Unlike an overlay, this replaces the normal chat view while active,
 * rendering full-width just like ctx.ui.confirm() and the questionnaire
 * tool.  The dialog appears at the bottom of the message area — the
 * same position as the old toolgate's ask prompt.
 *
 * Returns a Promise that resolves with:
 * - `{ approved: true }` — user approved
 * - `{ approved: false }` — user denied without a reason
 * - `{ approved: false, reason: "..." }` — user denied and provided a reason
 */
export function showConfirmWithReason(
	ctx: ExtensionContext,
	title: string,
	message: string,
): Promise<{ approved: boolean; reason?: string }> {
	return ctx.ui.custom<string>(
		(tui, theme, _keybindings, done) => {
			return new ConfirmWithReasonDialog(title, message, theme, {
				onApprove: () => done("approved"),
				onDeny: () => done("denied"),
				onRejectWithReason: (reason: string) => done(reason),
			});
		},
	).then((result) => {
		if (result === "approved") return { approved: true };
		if (result === "denied") return { approved: false };
		// result is the reason string
		return { approved: false, reason: result };
	});
}
