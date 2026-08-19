// Chat-list styling for translated messages, the watermark, the loading dot and
// the translator toolbar buttons. Pure presentation: it reads BDFDB class names
// and holds no plugin state, so it lives outside the runtime closure.
function createTranslatorStyles(BDFDB) {
	return `
					${BDFDB.dotCN._translatortranslatebutton + BDFDB.dotCNS._translatortranslating + BDFDB.dotCN.textareaicon} {
						color: var(--status-danger) !important;
					}
					${BDFDB.dotCN._translatorconfigbutton} {
						margin: 2px 3px 0 6px;
					}
					.translator-discord-emoji {
						width: 1.375em;
						height: 1.375em;
						object-fit: contain;
						vertical-align: -0.275em;
						margin: 0 0.05em;
					}
					.translator-discord-mention {
						display: inline;
						padding: 0 2px;
						border-radius: 3px;
						background: var(--mention-background, color-mix(in srgb, var(--brand-500, #5865f2) 30%, transparent));
						color: var(--mention-foreground, var(--brand-260, #c9cdfb)) !important;
						font-weight: 500;
						white-space: break-spaces;
					}
					.translator-discord-mention:hover {
						background: var(--mention-background-hover, color-mix(in srgb, var(--brand-500, #5865f2) 45%, transparent));
						color: var(--white-500, #fff) !important;
					}
					.translator-translated-message {
						margin-top: 4px;
						padding: 6px 10px 6px 12px;
						border-left: 2px solid var(--translator-accent-color, var(--brand-500, var(--text-link)));
						background: color-mix(in srgb, var(--translator-accent-color, var(--brand-500, var(--text-link))) 8%, transparent);
						border-radius: 6px;
						color: var(--translator-text-color, inherit);
					}
					.translator-translation-loading {
						display: inline-block;
						width: 12px;
						height: 12px;
						margin-left: 6px;
						box-sizing: border-box;
						vertical-align: -1px;
						border: 2px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
						border-top-color: var(--text-link);
						border-radius: 50%;
						animation: translator-loading-spin 750ms linear infinite;
					}
					@keyframes translator-loading-spin {
						to {transform: rotate(360deg);}
					}
					@media (prefers-reduced-motion: reduce) {
						.translator-translation-loading {animation-duration: 1600ms;}
					}
					.translator-protected-quote {
						color: var(--text-link);
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 14%, transparent);
						padding: 0 4px;
						border-radius: 4px;
						font-weight: 600;
					}
					.translator-reply-preview-multiline {
						overflow: visible !important;
						max-height: none !important;
					}
					.translator-reply-preview-body {
						overflow: visible !important;
						max-height: none !important;
						height: auto !important;
					}
					.translator-reply-preview-text {
						display: block !important;
						white-space: pre-wrap !important;
						overflow: visible !important;
						text-overflow: unset !important;
						-webkit-line-clamp: unset !important;
						line-clamp: unset !important;
						max-height: none !important;
						height: auto !important;
					}
					.translator-reply-preview-text > span {
						white-space: inherit !important;
						overflow: visible !important;
						text-overflow: unset !important;
					}
					.translator-reply-preview-body .translator-translated-message,
					.translator-reply-preview-text.translator-translated-message,
					.translator-reply-preview-text .translator-translated-message {
						margin: 0 !important;
						padding: 0 !important;
						border: 0 !important;
						border-left: 0 !important;
						background: transparent !important;
						box-shadow: none !important;
						color: inherit !important;
					}
					.translator-reply-preview-body [class*="translator"],
					.translator-reply-preview-text [class*="translator"] {
						background: transparent !important;
						box-shadow: none !important;
						color: inherit !important;
					}
					.translator-settings-inline-header {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 12px;
						margin-bottom: 8px;
					}
					.translator-settings-panel-root {
						overflow-anchor: none;
						overflow-x: hidden;
						max-width: 100%;
						box-sizing: border-box;
					}
					.translator-settings-panel-root [class*="select"] {
						overflow-anchor: none;
					}
										.translator-settings-panel-root {
						overflow-anchor: none;
					}
					.translator-settings-panel-root [class*="select"],
					.translator-settings-panel-root [class*="Select"],
					.translator-settings-panel-root [role="combobox"],
					.translator-stable-select-wrap,
					.translator-stable-select-wrap * {
						overflow-anchor: none;
						scroll-margin-top: 0 !important;
						scroll-margin-bottom: 0 !important;
					}
					.translator-stable-select-wrap {
						width: 100%;
						min-width: 0;
						max-width: 100%;
					}
					.translator-prefix-translation-row {
						display: grid;
						grid-template-columns: minmax(76px, 0.75fr) minmax(0, 1.65fr) 34px;
						gap: 10px;
						align-items: center;
						width: 100%;
						max-width: 100%;
						box-sizing: border-box;
						margin-bottom: 8px;
						overflow: hidden;
					}
					.translator-prefix-translation-cell,
					.translator-prefix-translation-cell > * {
						min-width: 0;
						max-width: 100%;
						box-sizing: border-box;
					}
					.translator-prefix-delete-cell {
						display: flex;
						align-items: center;
						justify-content: flex-end;
						min-width: 0;
						max-width: 34px;
						overflow: hidden;
					}
					.translator-prefix-delete-cell button {
						width: 30px !important;
						min-width: 30px !important;
						max-width: 30px !important;
						padding-left: 0 !important;
						padding-right: 0 !important;
					}
					.translator-prefix-input-cell input,
					.translator-prefix-language-cell .translator-stable-select-wrap,
					.translator-prefix-language-cell [class*="select"],
					.translator-prefix-language-cell [class*="Select"] {
						min-width: 0 !important;
						max-width: 100% !important;
						box-sizing: border-box;
					}
					.translator-token-editor {
						display: flex;
						flex-direction: column;
						gap: 8px;
						width: 100%;
						min-width: 0;
					}
					.translator-token-list {
						display: flex;
						flex-wrap: wrap;
						align-content: flex-start;
						gap: 6px;
						width: 100%;
						min-width: 0;
						min-height: 44px;
						max-height: 112px;
						overflow-y: auto;
						padding: 8px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--input-background, var(--background-tertiary));
						box-sizing: border-box;
					}
					.translator-token-empty {
						color: var(--text-muted);
						font-size: 12px;
						line-height: 1.5;
						padding: 2px 0;
					}
					.translator-token-badge {
						display: inline-flex;
						align-items: center;
						max-width: 100%;
						gap: 6px;
						padding: 4px 8px;
						border-radius: 6px;
						background: var(--bdfdb-blurple);
						color: #fff;
						font-size: 12px;
						line-height: 1.3;
						box-sizing: border-box;
					}
					.translator-token-badge-text {
						max-width: 100%;
						overflow-wrap: anywhere;
						word-break: break-word;
						white-space: normal;
					}
					.translator-token-badge-delete {
						display: inline-flex;
						align-items: center;
						justify-content: center;
						width: 14px;
						height: 14px;
						flex: 0 0 auto;
						cursor: pointer;
						opacity: 0.92;
					}
					.translator-token-badge-delete:hover {
						opacity: 1;
					}
					.translator-token-input-row,
					.translator-token-input-row > * {
						width: 100%;
						min-width: 0;
						max-width: 100%;
						box-sizing: border-box;
					}
					@media (max-width: 620px) {
						.translator-prefix-translation-row {
							grid-template-columns: minmax(76px, 1fr) 34px;
						}
						.translator-prefix-language-cell {
							grid-column: 1 / -1;
						}
					}

.translator-settings-inline-actions {
						display: flex;
						flex-wrap: wrap;
						justify-content: flex-end;
						gap: 8px;
					}
					.translator-settings-divider-spacious {
						margin-top: 14px !important;
						margin-bottom: 14px !important;
					}
					.translator-settings-note {
						margin-bottom: 8px;
						font-size: 12px;
						line-height: 1.45;
						color: var(--text-muted);
					}
					.translator-settings-switch-group {
						display: flex;
						flex-direction: column;
						margin: 6px 0 10px;
					}
					.translator-settings-switch-row {
						margin: 0 !important;
					}
					.translator-settings-switch-row + .translator-settings-switch-row {
						margin-top: 4px !important;
					}
					.translator-settings-primary-actions {
						gap: 10px;
					}
					.translator-settings-inline-grid {
						display: grid;
						grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
						gap: 12px;
						align-items: start;
					}
					.translator-settings-inline-grid > * {
						min-width: 0;
					}
					.translator-settings-color-option {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 12px;
						width: 100%;
					}
					.translator-color-palette {
						display: flex;
						flex-wrap: wrap;
						gap: 6px;
						margin-top: 6px;
					}
					.translator-loaded-status-floating {
						position: fixed;
						z-index: 999;
						display: inline-flex;
						align-items: center;
						gap: 6px;
						width: auto !important;
						min-width: 0 !important;
						max-width: min(230px, calc(100vw - 32px));
						padding: 4px 9px;
						border: 1px solid var(--background-modifier-accent, rgba(255,255,255,0.08)) !important;
						border-radius: 999px;
						background: var(--background-floating, #232428) !important;
						box-shadow: var(--shadow-low, 0 1px 3px rgba(0,0,0,0.32)) !important;
						color: var(--text-muted, #b5bac1);
						font-size: 12px;
						font-weight: 500;
						line-height: 16px;
						pointer-events: none;
						backdrop-filter: none;
						text-shadow: none;
					}
					.translator-loaded-status-floating::before,
					.translator-loaded-status-floating::after {
						content: none !important;
						display: none !important;
					}
					.translator-loaded-status-floating.translator-loaded-status-retryable {pointer-events: auto;}
					.translator-loaded-status-icon {
						display: inline-flex;
						width: 14px;
						height: 14px;
						color: var(--interactive-normal, var(--text-muted));
						flex: 0 0 auto;
					}
					.translator-loaded-status-icon > svg {display: block; width: 100%; height: 100%;}
					.translator-loaded-status-collecting .translator-loaded-status-icon,
					.translator-loaded-status-requesting .translator-loaded-status-icon,
					.translator-loaded-status-committing .translator-loaded-status-icon {color: var(--brand-500, var(--text-link));}
					.translator-loaded-status-repairing .translator-loaded-status-icon {color: var(--status-warning, var(--yellow-300));}
					.translator-loaded-status-done .translator-loaded-status-icon {color: var(--status-positive, var(--green-360));}
					.translator-loaded-status-failed .translator-loaded-status-icon {color: var(--status-danger, var(--red-400));}
					.translator-loaded-status-text {white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; max-width: 100%;}
					.translator-loaded-status-retry {
						appearance: none;
						margin: 0 0 0 2px;
						padding: 0 0 0 7px;
						border: 0;
						border-left: 1px solid var(--background-modifier-accent, rgba(255,255,255,0.12));
						background: transparent;
						color: var(--interactive-active, #f2f3f5);
						font: inherit;
						font-weight: 600;
						line-height: 16px;
						cursor: pointer;
					}
					.translator-loaded-status-retry:hover {color: var(--text-normal, #dbdee1);}
					.translator-loaded-status-inline {
						display: inline-flex;
						align-items: center;
						gap: 6px;
						width: fit-content;
						max-width: 100%;
						margin: 6px 0 10px;
						padding: 4px 9px;
						border: 1px solid var(--background-modifier-accent, rgba(255,255,255,0.08));
						border-radius: 999px;
						background: color-mix(in srgb, var(--background-secondary, #2b2d31) 88%, black 12%);
						color: var(--text-muted, #b5bac1);
						font-size: 12px;
						font-weight: 500;
						line-height: 16px;
						box-sizing: border-box;
					}
					.translator-loaded-status-inline-text {
						white-space: nowrap;
						overflow: hidden;
						text-overflow: ellipsis;
						min-width: 0;
					}
					.translator-native-color-input {
						width: 34px; height: 32px; padding: 0; border: 1px solid var(--background-modifier-accent);
						border-radius: 8px; background: transparent; cursor: pointer;
					}
					.translator-color-chip {
						appearance: none;
						position: relative;
						display: inline-flex;
						align-items: center;
						justify-content: center;
						width: 32px;
						height: 32px;
						padding: 0;
						border-radius: 8px;
						border: 1px solid var(--background-modifier-accent);
						background: var(--background-secondary-alt);
						box-shadow: none;
						color: var(--text-normal);
						cursor: pointer;
						font: inherit;
						transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
					}
					.translator-color-chip:hover {
						background: var(--background-modifier-hover);
						border-color: var(--brand-500, var(--text-link));
						color: var(--header-primary);
					}
					.translator-color-chip-active {
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 14%, var(--background-secondary-alt));
						border-color: var(--brand-500, var(--text-link));
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
						color: var(--header-primary);
					}
					.translator-color-chip-add {
						font-size: 14px;
						font-weight: 700;
					}
					.translator-color-chip-remove {
						font-size: 16px;
						font-weight: 700;
						color: var(--text-muted);
					}
					.translator-color-chip-remove:hover {
						color: var(--status-danger);
						border-color: var(--status-danger);
					}
					.translator-color-chip-delete {
						position: absolute;
						top: -5px;
						right: -5px;
						width: 15px;
						height: 15px;
						border-radius: 50%;
						display: flex;
						align-items: center;
						justify-content: center;
						background: var(--status-danger);
						color: white;
						font-size: 11px;
						font-weight: 700;
						line-height: 1;
						box-shadow: 0 0 0 2px var(--background-secondary-alt);
					}
					.translator-color-chip-code {
						display: none;
					}
					.translator-settings-color-swatch {
						width: 16px;
						height: 16px;
						border-radius: 4px;
						border: 1px solid var(--background-modifier-accent);
						flex: 0 0 auto;
					}
					.translator-color-custom-row {
						display: flex;
						align-items: center;
						gap: 8px;
						margin-top: 8px;
						max-width: 360px;
					}
					.translator-color-custom-input {
						flex: 1 1 auto;
						min-width: 0;
						height: 32px;
						box-sizing: border-box;
						padding: 0 10px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--input-background, var(--background-tertiary));
						color: var(--text-normal);
						font: inherit;
					}
					.translator-color-custom-input:focus {
						outline: none;
						border-color: var(--brand-500, var(--text-link));
					}
					.translator-secret-input-row {
						position: relative;
						margin-bottom: 8px;
					}
					.translator-secret-input-row .translator-secret-input {
						margin-bottom: 0 !important;
					}
					.translator-secret-input input {
						padding-right: 48px !important;
					}
					.translator-secret-toggle {
						position: absolute !important;
						top: 1px;
						right: 1px;
						bottom: 1px;
						width: 40px !important;
						padding: 0 !important;
						margin: 0 !important;
						display: flex !important;
						align-items: center !important;
						justify-content: center !important;
						border-radius: 0 4px 4px 0 !important;
						border: 0 !important;
						border-left: 1px solid var(--background-modifier-accent) !important;
						background: var(--input-background, var(--background-tertiary)) !important;
						box-shadow: none !important;
						color: var(--interactive-normal) !important;
						cursor: pointer !important;
						font-size: 16px !important;
						line-height: 1 !important;
						z-index: 2;
					}
					.translator-secret-toggle:hover {
						background: var(--background-modifier-hover) !important;
					}
					.translator-secret-toggle:focus-visible {
						outline: none !important;
						box-shadow: inset 0 0 0 1px var(--button-filled-brand-background, var(--brand-500)) !important;
					}
					.translator-secret-toggle svg {
						display: block;
					}
					.translator-settings-field-action {
						min-width: 92px !important;
						height: 32px !important;
						box-shadow: none !important;
						flex: 0 0 auto;
					}
					.translator-detector-panel {
						margin-bottom: 14px;
						padding: 12px 14px;
						border: 1px solid rgba(255, 255, 255, 0.055);
						border-radius: 8px;
						background: #202124;
						background: color-mix(in srgb, var(--background-secondary, #2b2d31) 78%, black 22%);
						box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
						box-sizing: border-box;
					}
					.translator-detector-panel .translator-settings-support-title {
						margin-bottom: 4px;
						font-size: 14px;
						font-weight: 700;
						line-height: 20px;
						color: var(--header-primary, #ffffff);
					}
					.translator-detector-panel .translator-settings-support-hint {
						margin-bottom: 10px;
						font-size: 13px;
						line-height: 1.45;
						color: var(--text-muted, #949ba4);
						opacity: 1;
					}
					.translator-detector-input-wrap {
						position: relative;
					}
					.translator-detector-textinput input {
						min-height: 34px !important;
						padding-right: 68px !important;
						border-color: rgba(255, 255, 255, 0.035) !important;
						background: color-mix(in srgb, var(--background-tertiary, #1e1f22) 86%, black 14%) !important;
					}
					.translator-detector-input-button {
						position: absolute !important;
						top: 50%;
						right: 8px;
						height: 26px !important;
						min-width: 46px !important;
						padding: 0 10px !important;
						transform: translateY(-50%);
						box-shadow: none !important;
						z-index: 2;
					}
					.translator-detector-input-button:active {
						transform: translateY(-50%) !important;
					}
					.translator-detector-result-row {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 10px;
						margin-top: 10px;
						padding: 8px 10px;
						border: 1px solid rgba(255, 255, 255, 0.045);
						border-radius: 7px;
						background: color-mix(in srgb, var(--background-tertiary, #1e1f22) 86%, black 14%);
					}
					.translator-detector-result-text {
						min-width: 0;
						color: var(--text-muted, #949ba4);
						font-size: 12.5px;
						line-height: 1.4;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
					.translator-detector-apply-button {
						flex: 0 0 auto;
						height: 28px !important;
						box-shadow: none !important;
					}
					.translator-settings-support-panel {
						margin-bottom: 8px;
						padding: 4px 0 0 0;
						border: 0;
						border-radius: 0;
						background: transparent;
					}
					.translator-advanced-protection-section {
						margin: 0 0 14px;
						padding: 0 0 2px;
					}
					.translator-advanced-protection-section + .translator-advanced-protection-section {
						margin-top: 16px;
						padding-top: 16px;
						border-top: 1px solid var(--background-modifier-accent);
					}
					.translator-advanced-protection-section .translator-settings-switch-group {
						margin-top: 8px;
						margin-bottom: 8px;
					}
					.translator-settings-support-row {
						display: flex;
						flex-wrap: wrap;
						gap: 8px;
					}
					.translator-settings-support-block + .translator-settings-support-block {
						margin-top: 12px;
						padding-top: 12px;
						border-top: 1px solid var(--background-modifier-accent);
					}
					.translator-settings-support-title {
						margin-bottom: 4px;
						font-size: 13px;
						font-weight: 600;
					}
					.translator-settings-support-hint {
						margin-bottom: 8px;
						line-height: 1.45;
						opacity: 0.8;
					}
					.translator-settings-meta {
						margin-top: 6px;
						font-size: 13px;
						line-height: 1.4;
						opacity: 0.75;
					}
					.translator-segmented-group {
						display: flex;
						flex-wrap: wrap;
						gap: 4px;
						margin-bottom: 8px;
						padding: 3px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--background-tertiary, var(--background-secondary));
					}
					.translator-segmented-button {
						appearance: none;
						display: inline-flex;
						align-items: center;
						justify-content: center;
						min-height: 32px;
						padding: 0 14px;
						border-radius: 7px;
						border: 0;
						background: transparent;
						box-shadow: none;
						color: var(--text-muted);
						cursor: pointer;
						font: inherit;
						font-size: 12px !important;
						font-weight: 600 !important;
						line-height: 1;
						transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
					}
					.translator-segmented-button:hover {
						background: var(--background-modifier-hover);
						color: var(--text-normal);
					}
					.translator-segmented-button-active {
						background: var(--background-secondary-alt);
						color: var(--header-primary);
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
					}
					.translator-segmented-button-disabled {
						opacity: 0.45;
						cursor: not-allowed;
					}
					.translator-segmented-button-disabled:hover {
						background: transparent;
						color: var(--text-muted);
					}
					.translator-decision-mode-grid {
						display: grid;
						grid-template-columns: 1fr 1fr;
						gap: 4px;
						width: 100%;
						margin: 8px 0 10px;
						padding: 3px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 7px;
						background: var(--background-secondary, #2b2d31);
					}
					.translator-decision-mode-grid .translator-segmented-button {
						width: 100%;
						min-height: 34px;
						border-radius: 5px;
						font-size: 13px !important;
						font-weight: 700 !important;
						background: transparent;
						color: var(--text-muted);
					}
					.translator-decision-mode-grid .translator-segmented-button:hover {
						background: var(--background-modifier-hover);
						color: var(--text-normal);
					}
					.translator-decision-mode-grid .translator-segmented-button-active {
						background: var(--brand-500, #5865f2);
						color: var(--white-500, #fff);
						box-shadow: none;
					}
					.translator-decision-mode-grid .translator-segmented-button-disabled {
						opacity: 0.45;
					}
					.translator-ai-prompt-textarea {
						box-sizing: border-box;
						width: 100%;
						min-height: 118px;
						margin: 8px 0;
						padding: 10px 12px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 6px;
						background: var(--input-background, var(--background-secondary, #2b2d31));
						color: var(--text-normal);
						font: inherit;
						font-size: 13px;
						line-height: 1.45;
						resize: vertical;
						outline: none;
						scrollbar-width: thin;
						scrollbar-color: var(--scrollbar-auto-thumb, var(--background-modifier-accent)) var(--input-background, var(--background-secondary, #2b2d31));
					}
					.translator-ai-prompt-textarea:focus {
						border-color: var(--brand-500, #5865f2);
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar {
						width: 8px;
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar-track {
						background: var(--input-background, var(--background-secondary, #2b2d31));
						border-radius: 8px;
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar-thumb {
						background: var(--scrollbar-auto-thumb, var(--background-modifier-accent));
						border: 2px solid var(--input-background, var(--background-secondary, #2b2d31));
						border-radius: 8px;
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar-thumb:hover {
						background: var(--scrollbar-auto-scrollbar-color-thumb, var(--interactive-muted));
					}
					.translator-preset-grid .translator-segmented-button {
						min-width: 84px;
					}
					.translator-scope-grid .translator-segmented-button {
						flex: 1 1 180px;
						min-height: 34px;
					}
					.translator-window-grid .translator-segmented-button {
						flex: 1 1 96px;
						min-height: 34px;
					}
					.translator-scope-switch {
						display: grid;
						grid-template-columns: 1fr 1fr;
						position: relative;
						padding: 3px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 999px;
						background: var(--background-tertiary, var(--background-secondary));
						overflow: hidden;
					}
					.translator-scope-switch::before {
						content: "";
						position: absolute;
						top: 3px;
						bottom: 3px;
						left: 3px;
						width: calc(50% - 3px);
						border-radius: 999px;
						background: var(--background-secondary-alt);
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
						transition: transform 160ms ease;
					}
					.translator-scope-switch-loaded::before {
						transform: translateX(100%);
					}
					.translator-scope-switch-button {
						appearance: none;
						position: relative;
						z-index: 1;
						height: 32px;
						padding: 0 12px;
						border: 0;
						border-radius: 999px;
						background: transparent;
						box-shadow: none;
						color: var(--text-muted);
						cursor: pointer;
						font: inherit;
						font-size: 12px !important;
						font-weight: 700 !important;
						line-height: 1;
					}
					.translator-scope-switch-button-active {
						color: var(--header-primary);
					}
					.translator-loaded-warning {
						margin: 7px 2px 4px;
						font-size: 12px;
						line-height: 1.45;
						color: var(--text-muted);
					}
					.translator-loaded-limit-row {
						display: grid;
						grid-template-columns: minmax(160px, 1fr) minmax(210px, 1.2fr);
						align-items: center;
						gap: 12px;
						margin: 10px 2px 4px;
					}
					.translator-loaded-limit-title {
						font-size: 13px;
						font-weight: 600;
						color: var(--header-primary);
					}
					.translator-loaded-limit-input {
						width: 100%;
					}
					.translator-loaded-window-switch {
						grid-template-columns: repeat(5, 1fr);
					}
					.translator-loaded-window-switch::before {
						display: none;
					}
					.translator-preset-grid {
						display: flex;
						flex-wrap: wrap;
						gap: 8px;
						margin-bottom: 10px;
					}
					.translator-preset-button {
						height: 30px !important;
						padding: 0 12px !important;
						border-radius: 999px !important;
						border: 1px solid var(--background-modifier-accent) !important;
						background: transparent !important;
						box-shadow: none !important;
						color: var(--text-normal) !important;
						font-size: 13px !important;
						font-weight: 600 !important;
					}
					.translator-preset-button:hover {
						background: var(--background-secondary-alt) !important;
						border-color: var(--brand-500, var(--text-link)) !important;
					}
					.translator-preset-button-active {
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 18%, transparent) !important;
						border-color: var(--brand-500, var(--text-link)) !important;
						color: var(--header-primary) !important;
					}
	`;
}

module.exports = {createTranslatorStyles};
