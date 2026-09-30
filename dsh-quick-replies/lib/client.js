window.__ModuleLoader__.load({
	id: "dsh-quick-replies",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/store.js
		/**
		* 快捷语数据层：localStorage 持久化 + 页内订阅。
		*
		* 结构 v1：{ pinned: [{id,text}], extra: [{id,text}] }
		* - pinned：输入框上方常驻显示的 chip（最多 PINNED_MAX 条，可编辑）
		* - extra：收进「更多」展开面板的快捷语（设置里新添加的默认进这里）
		*
		* 约束（store 层兜底，UI 层同步限制）：
		* - 每条快捷语最多 MAX_LEN 个字符（按 Unicode 码点计，超长截断）
		* - 置顶组最多 PINNED_MAX 条，满员后 pin() 静默拒绝
		*
		* 同一 bundle 内的 chip 条与设置页共享此模块实例，一端改动另一端实时刷新。
		*/
		const KEY = "dsh.quick-replies.v1";
		/** 首次使用（localStorage 无数据）时的默认置顶快捷语。 */
		const DEFAULT_PINNED_TEXTS = [
			"继续",
			"都按你说的做",
			"这不对，请你重新思考"
		];
		const listeners = /* @__PURE__ */ new Set();
		/** 当前内存态；null 表示尚未从 localStorage 加载。 */
		let current = null;
		function makeId() {
			return "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
		}
		/** 规整一段输入文本：去首尾空白并截到 MAX_LEN 个字符。 */
		function clip(text) {
			return Array.from(text.trim()).slice(0, 15).join("");
		}
		function defaultState() {
			return {
				pinned: DEFAULT_PINNED_TEXTS.map((text) => ({
					id: makeId(),
					text
				})),
				extra: []
			};
		}
		/** 复原时做形状校验：字段缺失/类型不对就丢弃该项，整体损坏则回退默认；
		*  文字统一走 clip 规整、置顶组裁到上限，防手改 localStorage 破坏约束。 */
		function sanitize(raw) {
			if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return defaultState();
			const clean = (list) => Array.isArray(list) ? list.filter((it) => it !== null && typeof it === "object" && typeof it.text === "string" && it.text.trim() !== "").map((it) => ({
				id: typeof it.id === "string" && it.id !== "" ? it.id : makeId(),
				text: clip(it.text)
			})).filter((it) => it.text !== "") : [];
			return {
				pinned: clean(raw.pinned).slice(0, 3),
				extra: clean(raw.extra)
			};
		}
		function load() {
			try {
				const raw = localStorage.getItem(KEY);
				if (raw === null) {
					const fresh = defaultState();
					current = fresh;
					persist();
					return fresh;
				}
				return sanitize(JSON.parse(raw));
			} catch {
				return defaultState();
			}
		}
		function persist() {
			try {
				localStorage.setItem(KEY, JSON.stringify(current));
			} catch {}
		}
		/** 读取当前快照（React 组件的 state 初值与订阅回调都用它）。 */
		function getSnapshot() {
			if (current === null) current = load();
			return current;
		}
		/** 订阅数据变更，返回取消订阅函数（供 useEffect 清理）。 */
		function subscribe(callback) {
			listeners.add(callback);
			return () => {
				listeners.delete(callback);
			};
		}
		function commit(next) {
			current = next;
			persist();
			for (const callback of listeners) callback();
		}
		/** 添加快捷语——按需求默认进「更多」组；空串/重复/超长截断后为空则忽略。 */
		function addExtra(text) {
			const clipped = clip(text);
			if (clipped === "") return;
			const snap = getSnapshot();
			if (snap.pinned.some((it) => it.text === clipped) || snap.extra.some((it) => it.text === clipped)) return;
			commit({
				pinned: snap.pinned,
				extra: [...snap.extra, {
					id: makeId(),
					text: clipped
				}]
			});
		}
		/** 重命名（两组通用）；空串或与他条重名则静默忽略。 */
		function update(id, text) {
			const clipped = clip(text);
			if (clipped === "") return;
			const snap = getSnapshot();
			if (snap.pinned.some((it) => it.id !== id && it.text === clipped) || snap.extra.some((it) => it.id !== id && it.text === clipped)) return;
			const map = (list) => list.map((it) => it.id === id ? {
				...it,
				text: clipped
			} : it);
			commit({
				pinned: map(snap.pinned),
				extra: map(snap.extra)
			});
		}
		/** 「更多」→ 置顶（追加到 pinned 末尾）；置顶组已满 PINNED_MAX 条时静默拒绝。 */
		function pin(id) {
			const snap = getSnapshot();
			if (snap.pinned.length >= 3) return;
			const item = snap.extra.find((it) => it.id === id);
			if (item === void 0) return;
			commit({
				pinned: [...snap.pinned, item],
				extra: snap.extra.filter((it) => it.id !== id)
			});
		}
		/** 置顶 → 「更多」（追加到 extra 末尾）。 */
		function unpin(id) {
			const snap = getSnapshot();
			const item = snap.pinned.find((it) => it.id === id);
			if (item === void 0) return;
			commit({
				pinned: snap.pinned.filter((it) => it.id !== id),
				extra: [...snap.extra, item]
			});
		}
		/** 删除（两组通用）。 */
		function remove(id) {
			const snap = getSnapshot();
			commit({
				pinned: snap.pinned.filter((it) => it.id !== id),
				extra: snap.extra.filter((it) => it.id !== id)
			});
		}
		//#endregion
		//#region src/client/chips.js
		/**
		* 快捷语 chip 条（`conversation.input.dock` slot 的渲染体）。
		*
		* 输入框卡片上方的独占一行：置顶快捷语常驻 + 「更多」按钮向上弹出
		* extra 组面板。点击任意 chip → 调用注入的 send(text)（由 index.js 的
		* register inject thunk 提供作用域化 conversation.send），面板自动收起。
		*/
		/** 订阅快捷语数据的共享 hook：chip 条与设置页实时联动。 */
		function useQuickReplies() {
			const [snap, setSnap] = (0, react.useState)(getSnapshot);
			(0, react.useEffect)(() => subscribe(() => {
				setSnap(getSnapshot());
			}), []);
			return snap;
		}
		function Chip({ text, onSend }) {
			return (0, react.createElement)("button", {
				type: "button",
				className: "qr-chip",
				title: text,
				onClick: onSend
			}, text);
		}
		/**
		* chip 条组件。props.send(text): Promise<void> 由注册方按会话作用域注入；
		* 发送结果以行尾短提示反馈（已发送/发送失败），失败不弹窗只记 console。
		*/
		function QuickRepliesRow({ send }) {
			const snap = useQuickReplies();
			const [open, setOpen] = (0, react.useState)(false);
			const [flash, setFlash] = (0, react.useState)(null);
			const timerRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				if (timerRef.current !== void 0) clearTimeout(timerRef.current);
			}, []);
			const flashOnce = (kind) => {
				setFlash(kind);
				if (timerRef.current !== void 0) clearTimeout(timerRef.current);
				timerRef.current = setTimeout(() => {
					setFlash(null);
				}, 1400);
			};
			const fire = (text) => {
				setOpen(false);
				if (typeof send !== "function") {
					flashOnce("error");
					return;
				}
				Promise.resolve().then(() => send(text)).then(() => {
					flashOnce("sent");
				}, (error) => {
					console.error("dsh-quick-replies: send failed: " + String(error));
					flashOnce("error");
				});
			};
			const extraEmpty = snap.extra.length === 0;
			return (0, react.createElement)("div", { className: "qr-bar" }, open ? (0, react.createElement)("div", { className: "qr-more" }, extraEmpty ? (0, react.createElement)("span", { className: "qr-empty" }, "还没有更多快捷语——在 设置 → 快捷语 里添加") : snap.extra.map((item) => (0, react.createElement)(Chip, {
				key: item.id,
				text: item.text,
				onSend: () => {
					fire(item.text);
				}
			}))) : null, (0, react.createElement)("div", { className: "qr-row" }, ...snap.pinned.map((item) => (0, react.createElement)(Chip, {
				key: item.id,
				text: item.text,
				onSend: () => {
					fire(item.text);
				}
			})), (0, react.createElement)("button", {
				type: "button",
				className: "qr-toggle" + (open ? " qr-toggle-open" : "") + (extraEmpty ? " qr-toggle-empty" : ""),
				title: extraEmpty ? "暂无更多快捷语，可在 设置 → 快捷语 中添加" : "展开/收起更多快捷语",
				onClick: () => {
					setOpen((v) => !v);
				}
			}, "更多", (0, react.createElement)("span", { className: "qr-caret" }, open ? "▴" : "▾")), flash === null ? null : (0, react.createElement)("span", { className: "qr-flash" + (flash === "error" ? " qr-flash-error" : "") }, flash === "sent" ? "已发送 ✓" : "发送失败 ✗")));
		}
		//#endregion
		//#region src/client/settings.js
		/**
		* 「快捷语」设置页（`settings.section` slot 的渲染体）。
		*
		* 两组列表管理：置顶快捷语（常驻 chip 排，上限 PINNED_MAX 条）/ 更多快捷语
		* （「更多」面板）。每组条目支持行内编辑文字（上限 MAX_LEN 字符）、置顶/
		* 取消置顶、删除；添加框新增的快捷语默认进「更多」组。
		* 组件自包含（读写 store 模块），不依赖框架注入的 props。
		*/
		function OpButton({ label, onClick, danger, disabled, title }) {
			return (0, react.createElement)("button", {
				type: "button",
				className: "qrs-op" + (danger ? " qrs-op-danger" : ""),
				onClick,
				disabled: disabled === true,
				title: title === void 0 ? void 0 : title
			}, label);
		}
		/** 单条快捷语行：展示态（文字 + 操作按钮）或编辑态（输入框 + 保存/取消）。 */
		function PhraseRow({ item, actions, editing, editDraft, onDraft, onBegin, onSave, onCancel }) {
			if (editing) return (0, react.createElement)("div", { className: "qrs-item qrs-item-editing" }, (0, react.createElement)("input", {
				className: "qrs-input qrs-editInput",
				value: editDraft,
				maxLength: 15,
				autoFocus: true,
				onChange: (event) => {
					onDraft(event.target.value);
				},
				onKeyDown: (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						onSave();
					} else if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				}
			}), (0, react.createElement)("span", { className: "qrs-itemOps" }, (0, react.createElement)(OpButton, {
				label: "保存",
				onClick: onSave,
				disabled: editDraft.trim() === ""
			}), (0, react.createElement)(OpButton, {
				label: "取消",
				onClick: onCancel
			})));
			return (0, react.createElement)("div", {
				key: item.id,
				className: "qrs-item"
			}, (0, react.createElement)("span", {
				className: "qrs-itemText",
				title: item.text
			}, item.text), (0, react.createElement)("span", { className: "qrs-itemOps" }, (0, react.createElement)(OpButton, {
				label: "编辑",
				onClick: () => {
					onBegin(item);
				}
			}), actions.pin !== void 0 ? (0, react.createElement)(OpButton, {
				label: "置顶",
				onClick: () => {
					actions.pin(item.id);
				},
				disabled: actions.pinDisabled === true,
				title: actions.pinDisabled === true ? `直接显示的快捷语最多 3 条` : void 0
			}) : null, actions.unpin !== void 0 ? (0, react.createElement)(OpButton, {
				label: "取消置顶",
				onClick: () => {
					actions.unpin(item.id);
				}
			}) : null, (0, react.createElement)(OpButton, {
				label: "删除",
				danger: true,
				onClick: () => {
					actions.remove(item.id);
				}
			})));
		}
		function Group({ title, hint, items, renderRow }) {
			return (0, react.createElement)("div", { className: "qrs-group" }, (0, react.createElement)("div", { className: "qrs-groupHead" }, (0, react.createElement)("span", { className: "qrs-groupTitle" }, title), (0, react.createElement)("span", { className: "qrs-groupHint" }, hint)), items.length === 0 ? (0, react.createElement)("div", { className: "qrs-emptyRow" }, "（空）") : (0, react.createElement)("div", { className: "qrs-list" }, ...items.map(renderRow)));
		}
		function QuickRepliesSettings() {
			const snap = useQuickReplies();
			const [draft, setDraft] = (0, react.useState)("");
			const [editingId, setEditingId] = (0, react.useState)(null);
			const [editDraft, setEditDraft] = (0, react.useState)("");
			const beginEdit = (item) => {
				setEditingId(item.id);
				setEditDraft(item.text);
			};
			const saveEdit = () => {
				if (editingId === null) return;
				update(editingId, editDraft);
				setEditingId(null);
			};
			const cancelEdit = () => {
				setEditingId(null);
			};
			const add = () => {
				const text = draft.trim();
				if (text === "") return;
				addExtra(text);
				setDraft("");
			};
			const rowProps = {
				editing: false,
				editDraft,
				onDraft: setEditDraft,
				onBegin: beginEdit,
				onSave: saveEdit,
				onCancel: cancelEdit
			};
			return (0, react.createElement)("div", { className: "qrs-page" }, (0, react.createElement)("p", { className: "qrs-desc" }, `点击输入框上方的快捷语即把该短语发送到当前会话；直接显示的快捷语最多 3 条，每条最多 15 个字符。`), (0, react.createElement)(Group, {
				title: "直接显示的快捷语",
				hint: `常驻显示在输入框上方，最多 3 条；点「编辑」修改文字`,
				items: snap.pinned,
				renderRow: (item) => (0, react.createElement)(PhraseRow, {
					...rowProps,
					key: item.id,
					item,
					editing: editingId === item.id,
					actions: {
						unpin,
						remove
					}
				})
			}), (0, react.createElement)(Group, {
				title: "更多快捷语",
				hint: "收进「更多」展开面板；新添加的默认进这一组",
				items: snap.extra,
				renderRow: (item) => (0, react.createElement)(PhraseRow, {
					...rowProps,
					key: item.id,
					item,
					editing: editingId === item.id,
					actions: {
						pin,
						pinDisabled: snap.pinned.length >= 3,
						remove
					}
				})
			}), (0, react.createElement)("div", { className: "qrs-add" }, (0, react.createElement)("input", {
				className: "qrs-input",
				value: draft,
				maxLength: 15,
				placeholder: `输入新的快捷语（最多 15 字），回车或点添加`,
				onChange: (event) => {
					setDraft(event.target.value);
				},
				onKeyDown: (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						add();
					}
				}
			}), (0, react.createElement)("button", {
				type: "button",
				className: "qrs-addBtn",
				onClick: add,
				disabled: draft.trim() === ""
			}, "添加")));
		}
		//#endregion
		//#region src/client/index.js
		/**
		* dsh-quick-replies — client half（浏览器半）。
		*
		* 在输入框卡片上方的独占一行（`conversation.input.dock`，目标条/排队行
		* 同款座位，order 30 使其紧贴输入卡片）注册快捷语 chip 条；在设置里新增
		* 「快捷语」页（`settings.section`）管理短语。
		*
		* 点击 chip 的发送走 `conversation.send(text)`（queue 模式），作用域寻址
		* 与官方 QueueDock 一致：register 的 inject thunk 收到 sessionId，在
		* `ctx.sessions.scope(sessionId)` 上取 conversation 服务。发送独立于输入框
		* 草稿——草稿不会被清掉。
		*/
		const inject = [
			"slots",
			"sessions",
			"conversation",
			"locale"
		];
		const ID = "dsh-quick-replies";
		const ZH = { title: "快捷语" };
		const EN = { title: "Quick Replies" };
		const CSS = [
			".qr-bar { position: relative; display: flex; justify-content: center; }",
			".qr-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 0 2px 6px; }",
			".qr-chip, .qr-toggle {",
			"  font: inherit; font-size: 12px; line-height: 1; padding: 5px 11px; border-radius: 999px;",
			"  border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit;",
			"  cursor: pointer; opacity: .82; white-space: nowrap;",
			"  transition: opacity .12s ease, border-color .12s ease, background .12s ease;",
			"}",
			".qr-chip:hover, .qr-toggle:hover { opacity: 1; border-color: rgba(127,127,137,.65); background: rgba(127,127,137,.12); }",
			".qr-chip:active { transform: translateY(1px); }",
			".qr-chip { flex: 1 1 0; max-width: 320px; text-align: center; overflow: hidden; text-overflow: ellipsis; }",
			".qr-toggle { flex: none; display: inline-flex; align-items: center; gap: 3px; }",
			".qr-caret { font-size: 10px; opacity: .8; }",
			".qr-toggle-empty { opacity: .5; }",
			".qr-flash { font-size: 11px; opacity: .75; padding: 0 4px; }",
			".qr-flash-error { color: #e5484d; opacity: 1; }",
			".qr-more {",
			"  position: absolute; right: 2px; bottom: calc(100% + 4px); z-index: 40;",
			"  max-width: 440px; padding: 8px;",
			"  display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;",
			"  border: 1px solid rgba(127,127,137,.35); border-radius: 10px;",
			"  background: rgba(127,127,137,.18);",
			"  background: color-mix(in srgb, canvas 94%, transparent);",
			"  backdrop-filter: blur(6px);",
			"  box-shadow: 0 4px 14px rgba(0,0,0,.18);",
			"}",
			".qr-empty { font-size: 12px; opacity: .65; padding: 2px 4px; }",
			".qrs-page { display: flex; flex-direction: column; gap: 16px; max-width: 640px; }",
			".qrs-desc { font-size: 12px; opacity: .7; margin: 0; }",
			".qrs-group { display: flex; flex-direction: column; gap: 8px; }",
			".qrs-groupHead { display: flex; align-items: baseline; gap: 8px; }",
			".qrs-groupTitle { font-size: 13px; font-weight: 600; }",
			".qrs-groupHint { font-size: 12px; opacity: .65; }",
			".qrs-list { display: flex; flex-direction: column; gap: 6px; }",
			".qrs-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid rgba(127,127,137,.2); border-radius: 8px; }",
			".qrs-itemText { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }",
			".qrs-itemOps { display: flex; gap: 6px; flex: none; }",
			".qrs-op { font: inherit; font-size: 12px; line-height: 1; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(127,127,137,.3); background: transparent; color: inherit; cursor: pointer; opacity: .8; }",
			".qrs-op:hover { opacity: 1; background: rgba(127,127,137,.12); }",
			".qrs-op-danger:hover { border-color: rgba(229,72,77,.55); color: #e5484d; }",
			".qrs-op:disabled { opacity: .4; cursor: default; }",
			".qrs-op:disabled:hover { background: transparent; opacity: .4; }",
			".qrs-editInput { flex: 1; }",
			".qrs-emptyRow { font-size: 12px; opacity: .55; padding: 2px 2px; }",
			".qrs-add { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid rgba(127,127,137,.18); }",
			".qrs-input { flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit; }",
			".qrs-input:focus { outline: none; border-color: rgba(127,127,137,.65); }",
			".qrs-addBtn { font: inherit; font-size: 13px; padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit; cursor: pointer; }",
			".qrs-addBtn:hover:not(:disabled) { background: rgba(127,127,137,.12); }",
			".qrs-addBtn:disabled { opacity: .45; cursor: default; }"
		].join("\n");
		function injectStyle() {
			const tagId = ID + "/quick-replies.css";
			if (document.querySelector("style[data-plugin-css=\"" + tagId + "\"]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = ID;
				tag.dataset.pluginCss = tagId;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
		}
		function apply(ctx) {
			injectStyle();
			try {
				ctx.locale.register(ID, "zh", ZH);
				ctx.locale.register(ID, "en", EN);
			} catch (e) {
				console.error(ID + ": locale registration failed: " + String(e));
			}
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "quick-replies",
				order: 30,
				inject: (sessionId) => {
					return { send: (text) => {
						const actx = ctx.sessions.scope(sessionId);
						const conversation = actx === void 0 ? void 0 : actx.get("conversation");
						if (conversation === void 0) return Promise.reject(/* @__PURE__ */ new Error(ID + ": conversation service unavailable"));
						return conversation.send(text);
					} };
				}
			}, QuickRepliesRow));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "quick-replies",
				order: 25,
				label: () => {
					try {
						return ctx.locale.t(ID, "title");
					} catch (e) {
						return "快捷语";
					}
				}
			}, QuickRepliesSettings));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
