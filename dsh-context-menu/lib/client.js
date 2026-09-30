window.__ModuleLoader__.load({
	id: "dsh-context-menu",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/index.js
		/**
		* dsh-context-menu — client half（浏览器半）。
		*
		* 全局监听 contextmenu（capture 阶段，先于 apps/web 的抑制脚本）：
		*   1. 右键落在可编辑元素（textarea / 文本 input / contenteditable / role=textbox）
		*      上时，阻止默认菜单并显示完整菜单（粘贴/剪切/复制/全选/撤销/重做）。
		*   2. 右键落在非编辑区域但页面存在选中文本时，显示精简菜单（复制）——
		*      消息正文等区域原生右键被前端抑制且无任何菜单，此分支补齐"选中即可复制"。
		* 纯 DOM 实现，不依赖任何 harness 服务，浏览器与 Electron 桌面版均生效。
		*/
		const ID = "dsh-context-menu";
		/** 视为「可编辑」的元素：右键在这些元素上时显示菜单。 */
		const EDITABLE_SELECTOR = [
			"textarea",
			"input:not([type=\"button\"]):not([type=\"submit\"]):not([type=\"reset\"]):not([type=\"checkbox\"]):not([type=\"radio\"]):not([type=\"color\"]):not([type=\"range\"]):not([type=\"file\"]):not([type=\"hidden\"]):not([type=\"image\"])",
			"[contenteditable=\"true\"]",
			"[contenteditable=\"plaintext-only\"]",
			"[role=\"textbox\"]"
		].join(", ");
		const CSS = [
			".dshcm-menu { position: fixed; z-index: 2147483647; min-width: 172px; padding: 4px; border-radius: 8px; font-size: 13px; line-height: 1.4; background: #ffffff; color: #1f2328; border: 1px solid rgba(127,127,137,.28); box-shadow: 0 8px 24px rgba(0,0,0,.18); user-select: none; -webkit-user-select: none; }",
			"body[data-ds-dark-theme] .dshcm-menu { background: #24272d; color: #e6e8eb; border-color: rgba(127,127,137,.42); box-shadow: 0 8px 24px rgba(0,0,0,.45); }",
			".dshcm-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 5px; cursor: pointer; white-space: nowrap; }",
			".dshcm-item:hover { background: rgba(127,127,137,.14); }",
			".dshcm-item[data-disabled=\"true\"] { opacity: .38; cursor: default; }",
			".dshcm-item[data-disabled=\"true\"]:hover { background: transparent; }",
			".dshcm-kbd { margin-left: 18px; font-size: 11px; opacity: .55; }",
			".dshcm-sep { height: 1px; margin: 4px 6px; background: rgba(127,127,137,.24); }"
		].join("\n");
		/** 每个 <style data-plugin> 标签只注入一次；卸载时由 dispose 移除。 */
		function injectStyle() {
			const tagId = "dsh-context-menu/menu.css";
			if (document.querySelector("style[data-plugin-css=\"dsh-context-menu/menu.css\"]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = ID;
				tag.dataset.pluginCss = tagId;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
		}
		/** 元素当前是否有选中文本（决定剪切/复制是否可用）。 */
		function hasSelection(el) {
			if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return typeof el.selectionStart === "number" && el.selectionStart !== el.selectionEnd;
			const sel = window.getSelection();
			return !!sel && sel.toString().length > 0 && sel.anchorNode !== null && el.contains(sel.anchorNode);
		}
		/** 当前页面选中文本（跨 shadow DOM 取纯文本）。 */
		function getSelectionText() {
			const sel = window.getSelection();
			return sel ? sel.toString() : "";
		}
		/** 向可编辑元素插入文本，并让 React 受控组件感知变更。 */
		function insertText(el, text) {
			el.focus();
			let ok = false;
			try {
				ok = document.execCommand("insertText", false, text);
			} catch (_) {
				ok = false;
			}
			if (ok) return;
			if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
				const s = el.selectionStart ?? el.value.length;
				const e = el.selectionEnd ?? el.value.length;
				el.value = el.value.slice(0, s) + text + el.value.slice(e);
				el.selectionStart = el.selectionEnd = s + text.length;
				el.dispatchEvent(new Event("input", { bubbles: true }));
			}
		}
		function apply() {
			// 与官方 dsh-tauri 系插件同一判据：web UI 在桌面壳里跑在 iframe 中
			// （window.parent!==window）；直接顶帧加载时 Tauri 也会注入
			// __TAURI_INTERNALS__。两种形态下官方 dsh-tauri-rightclick 都接管全部
			// 右键；本菜单 capture+preventDefault 若先跑会把它的 defaultPrevented
			// 检查挡死。顶层浏览器官方插件不挂载，本菜单继续补齐复制/粘贴。
			if (typeof window !== "undefined" && (window.parent !== window || window.__TAURI__ !== void 0 || window.__TAURI_INTERNALS__ !== void 0)) return;
			injectStyle();
			let menuEl = null;
			let activeEl = null;
			function close() {
				if (menuEl !== null) {
					menuEl.remove();
					menuEl = null;
				}
				activeEl = null;
			}
			function exec(command) {
				if (activeEl !== null) activeEl.focus();
				try {
					document.execCommand(command);
				} catch (_) {}
				close();
			}
			async function doPaste() {
				if (activeEl === null) return;
				try {
					const text = await navigator.clipboard.readText();
					insertText(activeEl, text);
				} catch (_) {
					try {
						document.execCommand("paste");
					} catch (_e) {}
				}
				close();
			}
			/** 复制当前页面选中文本：优先异步剪贴板 API，失败退回 execCommand。 */
			async function doCopySelection() {
				const text = getSelectionText();
				if (text !== "") {
					let ok = false;
					if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") try {
						await navigator.clipboard.writeText(text);
						ok = true;
					} catch (_) {
						ok = false;
					}
					if (!ok) try {
						document.execCommand("copy");
					} catch (_e) {}
				}
				close();
			}
			/** 构造单个菜单行。 */
			function makeRow(it) {
				const row = document.createElement("div");
				row.className = "dshcm-item";
				if (it.disabled) row.dataset.disabled = "true";
				const label = document.createElement("span");
				label.textContent = it.label;
				row.appendChild(label);
				if (it.kbd) {
					const kbd = document.createElement("span");
					kbd.className = "dshcm-kbd";
					kbd.textContent = it.kbd;
					row.appendChild(kbd);
				}
				row.addEventListener("mousedown", (e) => {
					e.preventDefault();
				});
				row.addEventListener("click", () => {
					if (!it.disabled) it.action();
				});
				return row;
			}
			function makeMenu() {
				const el = document.createElement("div");
				el.className = "dshcm-menu";
				el.dataset.plugin = ID;
				return el;
			}
			function buildMenu(target) {
				const canEdit = !(target.readOnly === true) && !(target.disabled === true);
				const canPaste = canEdit;
				const sel = hasSelection(target);
				const el = makeMenu();
				const rows = [
					{
						label: "粘贴",
						kbd: "Ctrl+V",
						action: doPaste,
						disabled: !canPaste
					},
					{ sep: true },
					{
						label: "剪切",
						kbd: "Ctrl+X",
						action: () => exec("cut"),
						disabled: !canEdit || !sel
					},
					{
						label: "复制",
						kbd: "Ctrl+C",
						action: () => exec("copy"),
						disabled: !sel
					},
					{
						label: "全选",
						kbd: "Ctrl+A",
						action: () => exec("selectAll"),
						disabled: false
					},
					{ sep: true },
					{
						label: "撤销",
						kbd: "Ctrl+Z",
						action: () => exec("undo"),
						disabled: !canEdit
					},
					{
						label: "重做",
						kbd: "Ctrl+Shift+Z",
						action: () => exec("redo"),
						disabled: !canEdit
					}
				];
				for (const it of rows) {
					if (it.sep) {
						const sep = document.createElement("div");
						sep.className = "dshcm-sep";
						el.appendChild(sep);
						continue;
					}
					el.appendChild(makeRow(it));
				}
				return el;
			}
			/** 非编辑区域有选中文本时的精简菜单。 */
			function buildSelectionMenu() {
				const el = makeMenu();
				el.appendChild(makeRow({
					label: "复制",
					kbd: "Ctrl+C",
					action: doCopySelection
				}));
				return el;
			}
			function onContextMenu(event) {
				const target = event.target;
				if (!(target instanceof Element)) return;
				if (target.closest(".dshcm-menu") !== null) return;
				const editable = target.closest(EDITABLE_SELECTOR);
				const hasPageSelection = getSelectionText() !== "";
				if (editable === null && !hasPageSelection) return;
				event.preventDefault();
				event.stopPropagation();
				close();
				if (editable !== null) {
					activeEl = editable;
					menuEl = buildMenu(editable);
				} else {
					activeEl = null;
					menuEl = buildSelectionMenu();
				}
				document.body.appendChild(menuEl);
				const rect = menuEl.getBoundingClientRect();
				let x = event.clientX;
				let y = event.clientY;
				if (x + rect.width > window.innerWidth - 4) x = window.innerWidth - rect.width - 4;
				if (y + rect.height > window.innerHeight - 4) y = window.innerHeight - rect.height - 4;
				if (x < 4) x = 4;
				if (y < 4) y = 4;
				menuEl.style.left = x + "px";
				menuEl.style.top = y + "px";
			}
			function onGlobalMouseDown(event) {
				if (menuEl !== null && !menuEl.contains(event.target)) close();
			}
			function onKeyDown(event) {
				if (event.key === "Escape") close();
			}
			function onBlur() {
				close();
			}
			document.addEventListener("contextmenu", onContextMenu, true);
			document.addEventListener("mousedown", onGlobalMouseDown, true);
			document.addEventListener("keydown", onKeyDown, true);
			window.addEventListener("blur", onBlur);
			return function dispose() {
				document.removeEventListener("contextmenu", onContextMenu, true);
				document.removeEventListener("mousedown", onGlobalMouseDown, true);
				document.removeEventListener("keydown", onKeyDown, true);
				window.removeEventListener("blur", onBlur);
				close();
				const tag = document.querySelector("style[data-plugin-css=\"dsh-context-menu/menu.css\"]");
				if (tag !== null) tag.remove();
			};
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map