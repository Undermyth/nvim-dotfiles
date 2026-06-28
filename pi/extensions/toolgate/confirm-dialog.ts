/**
 * confirm-dialog.ts — Three-way confirmation dialog for toolgate.
 *
 * Lets the user choose among three options using arrow-key navigation:
 *   Approve, Deny, Reject with reason.
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
import { matchesKey, Key, wrapTextWithAnsi, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Callbacks ────────────────────────────────────────────────────────────

export interface ConfirmWithReasonCallbacks {
	/** User selected Approve — allow the tool call. */
	onApprove: () => void;
	/** User selected Deny or pressed Escape — deny without a reason. */
	onDeny: () => void;
	/** User typed a reason and pressed Enter. */
	onRejectWithReason: (reason: string) => void;
	/** User pressed Ctrl+O — toggle tool output (preview window) expand/collapse. */
	onToggleTools?: () => void;
}

// ── Selectable option definition ─────────────────────────────────────────

interface SelectableOption {
	id: string;
	label: string;
	description: string;
}

const OPTIONS: SelectableOption[] = [
	{ id: "approve", label: "Approve", description: "Allow this tool call" },
	{ id: "deny", label: "Deny", description: "Block without explanation" },
	{ id: "reject", label: "Reject with reason", description: "Block and explain why" },
];

// ── Component ────────────────────────────────────────────────────────────

export class ConfirmWithReasonDialog implements Component {
	private mode: "options" | "reason" = "options";
	private optionIndex = 0;
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
		if (matchesKey(data, Key.up)) {
			this.optionIndex = Math.max(0, this.optionIndex - 1);
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.down)) {
			this.optionIndex = Math.min(OPTIONS.length - 1, this.optionIndex + 1);
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.enter)) {
			const selected = OPTIONS[this.optionIndex];
			switch (selected.id) {
				case "approve":
					this.callbacks.onApprove();
					break;
				case "deny":
					this.callbacks.onDeny();
					break;
				case "reject":
					this.mode = "reason";
					this.reasonBuffer = "";
					this.cursorPos = 0;
					this.invalidate();
					break;
			}
			return;
		}

		if (matchesKey(data, Key.escape)) {
			this.callbacks.onDeny();
			return;
		}

		// Ctrl+O: toggle tool output (preview window) expand/collapse
		if (matchesKey(data, "ctrl+o")) {
			this.callbacks.onToggleTools?.();
			this.invalidate();
			return;
		}

		// All other input is silently ignored in options mode.
	}

	private handleReasonInput(data: string): void {
		// Ctrl+O: toggle tool output (preview window) expand/collapse.
		// Must be checked before text input, so it works even while typing a reason.
		if (matchesKey(data, "ctrl+o")) {
			this.callbacks.onToggleTools?.();
			this.invalidate();
			return;
		}

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

		// Build the lines array.
		const lines: string[] = [];

		// ── Top separator ───────────────────────────────────────────────
		lines.push(theme.fg("accent", "─".repeat(termWidth)));

		// ── Title line ──────────────────────────────────────────────────
		const titleStyled = theme.fg("accent", theme.bold(title));
		lines.push(this.padLeft(titleStyled, padX));

		lines.push(""); // spacer

		// ── Message lines ───────────────────────────────────────────────
		const wrappedMessage = wrapTextWithAnsi(theme.fg("text", message), contentWidth);
		for (const msgLine of wrappedMessage) {
			lines.push(this.padLeft(msgLine, padX));
		}

		lines.push(""); // spacer

		// ── Options or reason input ─────────────────────────────────────
		if (this.mode === "options") {
			lines.push(...this.buildOptionsLines(padX, termWidth));
		} else {
			lines.push(...this.buildReasonLines(termWidth, padX));
		}

		// ── Bottom separator ────────────────────────────────────────────
		lines.push(theme.fg("accent", "─".repeat(termWidth)));

		return lines;
	}

	private buildOptionsLines(padX: number, termWidth: number): string[] {
		const { theme } = this;
		const lines: string[] = [];

		const renderWidth = Math.max(1, termWidth - padX * 2);

		for (let i = 0; i < OPTIONS.length; i++) {
			const opt = OPTIONS[i];
			const selected = i === this.optionIndex;
			const prefix = selected ? theme.fg("accent", "> ") : "  ";
			const prefixWidth = visibleWidth(prefix);

			// Main label line
			const label = `${i + 1}. ${opt.label}`;
			const styledLabel = selected
				? theme.fg("accent", label)
				: theme.fg("text", label);

			// Wrap description if it would exceed render width
			const firstLine = `${prefix}${styledLabel}`;
			const descPrefix = " ".repeat(prefixWidth);
			const descPrefixWidth = prefixWidth;

			lines.push(" ".repeat(padX) + firstLine);

			// Description on next line
			const desc = theme.fg("muted", opt.description);
			if (descPrefixWidth < renderWidth) {
				const wrappedDesc = wrapTextWithAnsi(desc, renderWidth - descPrefixWidth);
				for (const wLine of wrappedDesc) {
					lines.push(" ".repeat(padX) + descPrefix + wLine);
				}
			} else {
				lines.push(" ".repeat(padX) + descPrefix + desc);
			}
		}

		// Help text
		lines.push("");
		const help = theme.fg("dim", "↑↓ navigate • Enter select • Esc cancel • Ctrl+O toggle preview");
		lines.push(" ".repeat(padX) + help);

		return lines;
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

		const hintText = "Enter to confirm · Esc to go back · Ctrl+O toggle preview";
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
				onToggleTools: () => {
					const currentlyExpanded = ctx.ui.getToolsExpanded();
					ctx.ui.setToolsExpanded(!currentlyExpanded);
				},
			});
		},
	).then((result) => {
		if (result === "approved") return { approved: true };
		if (result === "denied") return { approved: false };
		// result is the reason string
		return { approved: false, reason: result };
	});
}
