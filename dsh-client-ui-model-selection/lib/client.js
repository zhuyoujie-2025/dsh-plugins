window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-model-selection",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_cordis = require("@deepseek-ai/cordis");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		//#region ../../util/values/src/index.ts
		/**
		* Weak-key lookup with a strongly retained iterable set of associated values.
		*
		* Each value must belong to only one key. The container performs no automatic
		* cleanup; owners delete associations or clear the container at lifecycle end.
		*/
		var WeakMapWithValues = class {
			keys = /* @__PURE__ */ new WeakMap();
			valueSet = /* @__PURE__ */ new Set();
			/** Live strongly retained values in insertion order. */
			values = this.valueSet;
			/**
			* Read the value associated with a key.
			* @param key - weakly held lookup key.
			* @returns the associated value, or absence.
			*/
			get(key) {
				return this.keys.get(key);
			}
			/**
			* Test whether a key has an association.
			* @param key - weakly held lookup key.
			* @returns whether the key is present.
			*/
			has(key) {
				return this.keys.has(key);
			}
			/**
			* Associate one key with one caller-unique value.
			* @param key - weakly held lookup key.
			* @param value - strongly retained value that belongs to no other key.
			* @returns this container.
			*/
			set(key, value) {
				if (this.keys.has(key)) {
					const previous = this.keys.get(key);
					if (previous === value) return this;
					this.valueSet.delete(previous);
				}
				this.keys.set(key, value);
				this.valueSet.add(value);
				return this;
			}
			/**
			* Remove one association and its strongly retained value.
			* @param key - weakly held lookup key.
			* @returns whether an association was removed.
			*/
			delete(key) {
				if (!this.keys.has(key)) return false;
				const value = this.keys.get(key);
				const deleted = this.keys.delete(key);
				this.valueSet.delete(value);
				return deleted;
			}
			/** Remove every association and strongly retained value. */
			clear() {
				this.keys = /* @__PURE__ */ new WeakMap();
				this.valueSet.clear();
			}
		};
		//#endregion
		//#region lib/types/client/catalog.js
		/** One Host-generation model catalog shared by every Session selector. */
		/** Loads at most one model catalog for the current Host generation. */
		var ModelCatalogDirectory = class {
			ctx;
			/** Current shared catalog value and load lifecycle. */
			store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
				value: null,
				status: "idle",
				error: null
			});
			reasoning = /* @__PURE__ */ new Map();
			/**
			* Read the last advertised reasoning metadata, including unavailable models.
			* @param selection - provider and model whose effort is displayed.
			* @returns reasoning metadata observed during this Host generation.
			*/
			reasoningFor(selection) {
				return this.reasoning.get(JSON.stringify([selection.provider, selection.model]));
			}
			generation = 0;
			inflight;
			/**
			* @param ctx - the providing plugin's context, whose `remote.session`
			* namespace carries the Host-generation catalog.
			*/
			constructor(ctx) {
				this.ctx = ctx;
			}
			/**
			* Return the current generation's catalog, sharing its one in-flight load.
			* @returns the loaded global catalog.
			*/
			load() {
				const state = this.store.getSnapshot();
				if (state.status === "ready" && state.value !== null) return Promise.resolve(state.value);
				if (this.inflight !== void 0) return this.inflight;
				const generation = this.generation;
				this.store.update((draft) => {
					draft.status = "loading";
					draft.error = null;
				});
				const operation = this.ctx.remote.session.modelCatalog().then((response) => {
					if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`);
					if (generation === this.generation) {
						for (const group of response.value.groups) for (const model of group.models) this.reasoning.set(JSON.stringify([group.id, model.id]), model.reasoning);
						this.store.set({
							value: response.value,
							status: "ready",
							error: null
						});
					}
					return response.value;
				}).catch((error) => {
					if (generation === this.generation) this.store.update((draft) => {
						draft.status = "error";
						draft.error = error instanceof Error ? error.message : String(error);
					});
					throw error;
				}).finally(() => {
					if (generation === this.generation && this.inflight === operation) this.inflight = void 0;
				});
				this.inflight = operation;
				return operation;
			}
			/**
			* Invalidate the loaded catalog; the next explicit menu read reloads it.
			* @param clear - whether values from the previous Host generation must be hidden.
			*/
			invalidate(clear = false) {
				this.generation += 1;
				this.inflight = void 0;
				const value = clear ? null : this.store.getSnapshot().value;
				this.store.set({
					value,
					status: "idle",
					error: null
				});
			}
			/** Invalidate and reload the catalog after a Host-side model input changes. */
			refresh() {
				this.invalidate();
				this.load().catch(() => {});
			}
			/** Clear Host-specific values and load the replacement Host generation. */
			resetGeneration() {
				this.reasoning.clear();
				this.invalidate(true);
				this.load().catch(() => {});
			}
		};
		//#endregion
		//#region lib/types/client/directory.js
		/** One session's shared directory controller; disposed with the session scope. */
		var ModelDirectory = class {
			sessions;
			sessionId;
			available;
			catalog;
			projected;
			/** The shared snapshot both entries render from (uSES-safe store). */
			store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
				current: null,
				routable: null,
				groups: [],
				failures: [],
				status: "idle",
				pending: null,
				error: null
			});
			/** Latest selection operation wins; an older response never overwrites a newer one. */
			generation = 0;
			disposed = false;
			unsubscribeCatalog;
			unsubscribeSelection;
			/**
			* @param sessions - the session wire face (captured from the plugin's root connection).
			* @param sessionId - the owning session.
			* @param available - whether this session may use Agent-bound model RPCs.
			* @param catalog - Host-generation catalog shared by every Session.
			* @param projected - durable model selection projected from Session history.
			*/
			constructor(sessions, sessionId, available, catalog, projected) {
				this.sessions = sessions;
				this.sessionId = sessionId;
				this.available = available;
				this.catalog = catalog;
				this.projected = projected;
				this.unsubscribeCatalog = catalog.store.subscribe(() => {
					this.syncInputs();
				});
				this.unsubscribeSelection = projected.subscribe(() => {
					this.syncInputs();
				});
				this.syncInputs();
			}
			/**
			* Ensure the Host generation's shared available catalog is loaded.
			* @returns the fresh directory value.
			*/
			async load() {
				this.assertAvailable();
				await this.catalog.load();
				this.syncInputs();
				return this.store.getSnapshot();
			}
			/**
			* Select the complete provider/model/reasoning selection. The durable
			* projection frame updates the shared current; failures surface on the store
			* and return with the operation so each entry can present its own failure.
			* @param selection - provider, provider-owned model id, and optional adapter-owned effort.
			* @returns the selection outcome, including the original Remote failure.
			*/
			async select(selection) {
				this.assertAvailable();
				const generation = ++this.generation;
				this.store.update((s) => {
					s.status = "selecting";
					s.pending = selection;
					s.error = null;
				});
				const result = await this.sessions.selectModel({
					sessionId: this.sessionId,
					provider: selection.provider,
					model: selection.model,
					...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: selection.reasoningEffort }
				});
				if (this.disposed || generation !== this.generation) return result.ok ? {
					ok: true,
					value: void 0
				} : result;
				if (!result.ok) {
					this.store.update((s) => {
						s.status = "error";
						s.pending = null;
						s.error = `${result.error.code}: ${result.error.message}`;
					});
					return result;
				}
				this.store.update((s) => {
					s.status = "ready";
					s.pending = null;
					s.error = null;
				});
				this.syncInputs();
				return {
					ok: true,
					value: void 0
				};
			}
			/**
			* Invalidate an in-flight selection response from the previous Host generation.
			*/
			resetConnected() {
				if (this.disposed) return;
				++this.generation;
				this.store.update((state) => {
					if (state.status === "selecting") state.status = "idle";
					state.pending = null;
					state.error = null;
				});
				this.syncInputs();
			}
			/** Scope teardown: late settlements lose write access to the store. */
			dispose() {
				this.disposed = true;
				this.unsubscribeSelection();
				this.unsubscribeCatalog();
			}
			assertAvailable() {
				if (!this.available()) throw new Error("model selection is unavailable for addressed subagent sessions");
			}
			syncInputs() {
				if (this.disposed) return;
				const catalog = this.catalog.store.getSnapshot();
				const projected = modelSelectionProjection(this.projected.getSnapshot());
				const intended = projected?.next ?? catalog.value?.default;
				const reasoning = intended === void 0 ? void 0 : this.catalog.reasoningFor(intended);
				const effort = intended?.reasoningEffort ?? reasoning?.defaultEffort;
				const retainedEffort = effort === void 0 ? void 0 : reasoning?.efforts.find((level) => level.id === effort)?.name ?? effort;
				if (catalog.status !== "ready" || catalog.value === null || projected === void 0) {
					this.store.set({
						current: catalog.value === null ? null : this.store.getSnapshot().current,
						...retainedEffort === void 0 ? {} : { retainedEffort },
						routable: null,
						groups: catalog.value?.groups ?? [],
						failures: catalog.value?.failures ?? [],
						status: catalog.status === "error" ? "error" : "loading",
						pending: this.store.getSnapshot().pending,
						error: catalog.error
					});
					return;
				}
				const selection = projected.next ?? catalog.value.default;
				const routable = catalog.value.groups.some((group) => group.id === selection.provider && group.models.some((model) => model.id === selection.model));
				this.store.set({
					current: selection,
					...retainedEffort === void 0 ? {} : { retainedEffort },
					routable,
					groups: catalog.value.groups,
					failures: catalog.value.failures,
					status: this.store.getSnapshot().status === "selecting" ? "selecting" : "ready",
					pending: this.store.getSnapshot().pending,
					error: null
				});
			}
		};
		function modelSelectionProjection(value) {
			return value === void 0 ? void 0 : value;
		}
		//#endregion
		//#region lib/types/client/service.js
		/**
		* ModelDirectoryResolver (`ctx.modelDirectories`): the root owner of per-session
		* {@link ModelDirectory} instances. Both selection entries (the /model popup
		* and the composer model seat) resolve their session's directory through
		* this service, which is what makes the dual entry one shared state.
		*
		* Per-session storage follows the client service pattern (InputTriggerService /
		* CommandUiRuntime): a lazy service-internal map whose entry is deleted by the
		* owning scope's disposer. The host `dsh-scope` ScopedLayers registry does
		* does not belong here: it derives scope from the host carrier mechanism
		* (object-keyed), while client scopes tag contexts with branded SessionId
		* strings, and it models global+shadow named registries — this is a
		* per-session singleton with no global layer to merge.
		*/
		/** The `ctx.modelDirectories` session model-selection service. */
		var ModelDirectoryResolver = class extends _deepseek_ai_cordis.Service {
			static inject = [
				"sessions",
				"remote",
				"remote.session"
			];
			live = { directories: new WeakMapWithValues() };
			catalog;
			/**
			* @param ctx - owning root context (the service registers itself as `models`).
			*/
			constructor(ctx) {
				super(ctx, "modelDirectories");
				this.catalog = new ModelCatalogDirectory(ctx);
				this.catalog.load().catch(() => {});
				ctx.on("connection/reset", () => {
					this.catalog.resetGeneration();
					for (const directory of this.live.directories.values) directory.resetConnected();
				});
				ctx.remote.$on("llm/adapters-updated", () => {
					this.catalog.refresh();
				});
				ctx.remote.$on("settings/document-updated", () => {
					this.catalog.refresh();
				});
				ctx.remote.$on("credentials/record-updated", () => {
					this.catalog.refresh();
				});
				ctx.remote.$on("credentials/reference-updated", () => {
					this.catalog.refresh();
				});
			}
			/**
			* Resolve the per-session shared directory (lazy; the scope disposer
			* removes and disposes it). Unknown sessions fail loud.
			* @param sessionId - the owning session.
			* @returns the resident directory both entries share.
			*/
			directoryFor(sessionId) {
				const { live } = this;
				const sessions = this.ctx.sessions;
				const actx = sessions.scope(sessionId);
				if (actx === void 0) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no scope`);
				const binding = sessions.binding(sessionId);
				if (binding === void 0) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no binding`);
				const existing = live.directories.get(binding);
				if (existing !== void 0) return existing;
				const directory = new ModelDirectory(this.ctx.remote.session, sessionId, () => sessions.subagentAddress(sessionId) === void 0, this.catalog, binding.session.projections.faceOf("modelSelection"));
				live.directories.set(binding, directory);
				actx.effect(() => () => {
					directory.dispose();
					live.directories.delete(binding);
				}, "ui-model-selection: session directory");
				return directory;
			}
		};
		//#endregion
		//#region ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-model-selection/src/client/ModelSelect.module.css.mjs
		const css = "._7KE1Ra_root{min-width:0;position:relative}._7KE1Ra_trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:flex}._7KE1Ra_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._7KE1Ra_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}._7KE1Ra_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}._7KE1Ra_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}._7KE1Ra_triggerEffort{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-caption);flex-shrink:1000;overflow:hidden}._7KE1Ra_triggerIcon{display:var(--dsh-composer-model-icon-display,none);flex:none}._7KE1Ra_triggerLabel,._7KE1Ra_triggerEffort{display:var(--dsh-composer-model-text-display,block)}._7KE1Ra_chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}._7KE1Ra_chevronOpen{transform:rotate(180deg)}._7KE1Ra_menu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;flex-direction:column;padding:4px;display:flex;position:fixed;overflow:hidden}._7KE1Ra_status,._7KE1Ra_empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}._7KE1Ra_error,._7KE1Ra_warning{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}._7KE1Ra_warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}._7KE1Ra_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}._7KE1Ra_groups{min-height:0;overflow-y:auto}._7KE1Ra_group+._7KE1Ra_group{margin-top:3px}._7KE1Ra_groupTitle{z-index:1;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);padding:4px 7px 2px;font-size:11px;font-weight:500;line-height:16px;position:sticky;top:0}._7KE1Ra_option{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:5px 7px;display:flex}._7KE1Ra_option:hover:not(:disabled),._7KE1Ra_option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}._7KE1Ra_selected{background:0 0}._7KE1Ra_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}._7KE1Ra_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}._7KE1Ra_modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:18px;overflow:hidden}._7KE1Ra_check{color:var(--dsw-alias-label-primary);flex:0 0 14px;place-items:center;display:grid}._7KE1Ra_check svg{width:14px;height:14px}._7KE1Ra_cell{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;align-items:center;gap:6px;padding:0 8px;font-size:13px;line-height:20px;display:flex}._7KE1Ra_cell:hover{background:var(--dsw-alias-interactive-bg-hover)}._7KE1Ra_cellLabel{white-space:nowrap;flex:none}._7KE1Ra_cellValue{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;overflow:hidden}._7KE1Ra_cellChevron{width:12px;height:12px;color:var(--dsw-alias-menu-icon);flex:none}";
		const tagId = "@deepseek-ai/dsh-client-ui-model-selection/ModelSelect.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-model-selection";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ModelSelect_module_css_default = {
			"cell": "_7KE1Ra_cell",
			"cellChevron": "_7KE1Ra_cellChevron",
			"cellLabel": "_7KE1Ra_cellLabel",
			"cellValue": "_7KE1Ra_cellValue",
			"check": "_7KE1Ra_check",
			"chevron": "_7KE1Ra_chevron",
			"chevronOpen": "_7KE1Ra_chevronOpen",
			"empty": "_7KE1Ra_empty",
			"error": "_7KE1Ra_error",
			"group": "_7KE1Ra_group",
			"groupTitle": "_7KE1Ra_groupTitle",
			"groups": "_7KE1Ra_groups",
			"menu": "_7KE1Ra_menu",
			"modelName": "_7KE1Ra_modelName",
			"option": "_7KE1Ra_option",
			"optionCopy": "_7KE1Ra_optionCopy",
			"retry": "_7KE1Ra_retry",
			"root": "_7KE1Ra_root",
			"selected": "_7KE1Ra_selected",
			"status": "_7KE1Ra_status",
			"description": "_7KE1Ra_description",
			"providerOptions": "_7KE1Ra_providerOptions",
			"rootPane": "_7KE1Ra_rootPane",
			"modelCell": "_7KE1Ra_modelCell",
			"modelCellName": "_7KE1Ra_modelCellName",
			"effortCluster": "_7KE1Ra_effortCluster",
			"effortCaption": "_7KE1Ra_effortCaption",
			"slider": "_7KE1Ra_slider",
			"sliderBusy": "_7KE1Ra_sliderBusy",
			"track": "_7KE1Ra_track",
			"fill": "_7KE1Ra_fill",
			"thumb": "_7KE1Ra_thumb",
			"labels": "_7KE1Ra_labels",
			"levelLabel": "_7KE1Ra_levelLabel",
			"levelLabelCurrent": "_7KE1Ra_levelLabelCurrent",
			"levelLabelSynth": "_7KE1Ra_levelLabelSynth",
			"synthMark": "_7KE1Ra_synthMark",
			"trigger": "_7KE1Ra_trigger",
			"triggerEffort": "_7KE1Ra_triggerEffort",
			"triggerIcon": "_7KE1Ra_triggerIcon",
			"triggerLabel": "_7KE1Ra_triggerLabel",
			"warning": "_7KE1Ra_warning"
		};
		//#endregion
		//#region manufacturer.ts (ported from dsh-rc2 — original-manufacturer grouping for the model directory)
		const MANUFACTURER_BY_ID = {
			deepseek: "DeepSeek",
			openai: "OpenAI",
			anthropic: "Anthropic",
			google: "Google",
			"z-ai": "Zhipu",
			"x-ai": "xAI",
			grok: "xAI",
			qwen: "Qwen",
			minimax: "MiniMax",
			moonshotai: "Moonshot",
			kimi: "Moonshot",
			"bytedance-seed": "ByteDance",
			doubao: "ByteDance",
			gemini: "Google",
			glm: "Zhipu",
			claude: "Anthropic",
			gpt: "OpenAI",
			mimo: "Xiaomi",
			mistral: "Mistral",
			mistralai: "Mistral",
			cohere: "Cohere",
			nvidia: "NVIDIA",
			meta: "Meta",
			meituan: "Meituan",
			poolside: "Poolside",
			sakana: "Sakana",
			scnet: "SCNet",
			sensenova: "SenseTime",
			stepfun: "StepFun",
			tencent: "Tencent",
			hy3: "Tencent",
			thinkingmachines: "Thinking Machines",
			upstage: "Upstage",
			xiaomi: "Xiaomi",
			agnes: "Agnes"
		};
		const MANUFACTURER_ALIAS = {
			SpaceXAI: "xAI",
			"Z.ai": "Zhipu",
			MoonshotAI: "Moonshot",
			"ByteDance Seed": "ByteDance"
		};
		const NAME_PREFIX_RE = /^([A-Za-z0-9][A-Za-z0-9 .&_-]{1,40}):\s/;
		const ID_PREFIX_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*)\//;
		const PROVIDER_DECOR_RE = /\s*\((Ark|Teamo|百炼|OpenCode Go|Google AI Studio)\)\s*$/;
		const WEBFREE_ALIAS = {
			"deepseek webfree 快速 (deepseek webfree)": "DeepSeek V4 Flash",
			"deepseek webfree 专家 (deepseek webfree)": "DeepSeek V4 Pro"
		};
		function manufacturerOf(modelId, modelName) {
			const nameMatch = NAME_PREFIX_RE.exec(modelName ?? "");
			if (nameMatch !== null) {
				const label = (nameMatch[1] ?? "").trim();
				return MANUFACTURER_ALIAS[label] ?? label;
			}
			const idMatch = ID_PREFIX_RE.exec(modelId);
			if (idMatch !== null) {
				const label = MANUFACTURER_BY_ID[(idMatch[1] ?? "").toLowerCase()];
				if (label !== undefined) return label;
			}
			const lowerId = modelId.toLowerCase();
			for (const prefix of Object.keys(MANUFACTURER_BY_ID)) {
				if (!lowerId.startsWith(prefix)) continue;
				const label = MANUFACTURER_BY_ID[prefix];
				if (label !== undefined) return label;
			}
			return "其他";
		}
		function canonicalModelName(modelName) {
			let name = (modelName ?? "").replace(NAME_PREFIX_RE, "");
			name = name.replace(PROVIDER_DECOR_RE, "");
			name = name.replace(/([A-Za-z0-9])-([A-Za-z0-9])/g, "$1 $2");
			name = name.replace(/\s+/g, " ").trim();
			if (/^Seed(?:\s|$)/i.test(name)) name = `Doubao ${name}`;
			name = name.replace(/^DLUT\s+(?=Qwen)/i, "");
			name = name.replace(/\bhighspeed\b/gi, "Highspeed");
			const alias = WEBFREE_ALIAS[name.toLowerCase()];
			if (alias !== undefined) return alias;
			return name.length > 0 ? name : (modelName ?? "").trim();
		}
		function modelWithProvider(modelName, providerName) {
			const suffix = `(${providerName})`;
			return modelName.endsWith(suffix) ? modelName : `${modelName} ${suffix}`;
		}
		function offeringsOf(groups) {
			const rows = [];
			for (const group of groups) for (const model of group.models) rows.push({
				provider: group.id,
				providerName: providerDisplayName(group),
				model
			});
			return rows;
		}
		function providerDisplayName(group) {
			return group.name;
		}
		function manufacturerCatalogOf(offerings) {
			const byManufacturer = new Map();
			for (const offering of offerings) {
				const manufacturer = manufacturerOf(offering.model.id, offering.model.name);
				let models = byManufacturer.get(manufacturer);
				if (models === undefined) {
					models = new Map();
					byManufacturer.set(manufacturer, models);
				}
				const name = canonicalModelName(offering.model.name);
				let entry = models.get(name);
				if (entry === undefined) {
					entry = { name, offerings: [] };
					models.set(name, entry);
				}
				entry.offerings.push(offering);
			}
			const groups = [...byManufacturer.entries()].map(([manufacturer, models]) => ({
				manufacturer,
				models: [...models.values()]
			}));
			groups.sort(compareGroups);
			for (const group of groups) group.models.sort(compareEntries);
			return groups;
		}
		const MANUFACTURER_FAME = {
			DeepSeek: 0,
			OpenAI: 1,
			Anthropic: 2,
			Google: 3,
			Qwen: 4,
			Moonshot: 5,
			"xAI": 6,
			"MiniMax": 7,
			ByteDance: 8,
			"ByteDance Seed": 8,
			Zhipu: 9,
			Xiaomi: 10,
			Mistral: 11,
			Cohere: 12,
			NVIDIA: 13,
			Meta: 14,
			Meituan: 15,
			Tencent: 16,
			Agnes: 17,
			Poolside: 18,
			StepFun: 19,
			Sakana: 20,
			"Thinking Machines": 21,
			SenseTime: 22,
			SCNet: 23,
			Upstage: 24,
			其他: 999
		};
		const MODEL_FAME = {
			"DeepSeek V4 Pro": 0,
			"DeepSeek V4 Flash": 1,
			"GPT 5.5": 2,
			"GPT 5.6 Sol Pro": 3,
			"GPT 5.6 Sol": 4,
			"GPT 5.6 Terra Pro": 5,
			"GPT 5.6 Terra": 6,
			"GPT 5.6 Luna Pro": 7,
			"GPT 5.6 Luna": 8,
			"Claude Fable 5": 10,
			"Claude Fable": 11,
			"Claude Opus 5": 12,
			"Claude Opus 5 (Fast)": 13,
			"Claude Sonnet 5": 14,
			"Gemini 3.7 Flash": 20,
			"Gemini 3.6 Flash": 21,
			"Gemini 3.5 Flash Lite": 22,
			"Qwen3.8 Max": 30,
			"Qwen3.7 Max": 31,
			"Qwen3.7 Plus": 32,
			"Qwen3.6 Plus": 33,
			"Qwen3 Max": 34,
			"GLM 5.3": 40,
			"GLM 5.2": 41,
			"GLM 5.1": 42,
			"GLM 5": 43,
			"GLM 4.7": 44,
			"GLM 4.5 Air": 45,
			"Kimi K3": 50,
			"Kimi K2.7 Code": 51,
			"Kimi K2.6": 52,
			"MiniMax M3": 60,
			"MiniMax M2.7": 61,
			"Grok 4.5": 70,
			"MiMo V2.5 Pro": 80,
			"MiMo V2.5": 81,
			"Doubao Seed 2.1 Pro": 90,
			"Doubao Seed 2.1 Turbo": 91,
			"Doubao Seed Evolving": 92,
			"Doubao Seed 2.0 Lite": 93,
			"Doubao Seed 2.0 Mini": 94,
			"Doubao Seed 2.0 Code": 95,
			Hy3: 100,
			"Command A": 120,
			"Mistral Medium 3.5": 130,
			"Nemotron 3.5 Lightning": 140,
			"Muse Glimmer 30B": 150,
			"LongCat 2.0": 160,
			"Laguna S 2.1": 170,
			"Sakana Namazu": 180,
			"Step 3.7 Flash": 190,
			"Inkling Small": 210,
			"Solar Pro 4": 220,
			"Agnes 2.0 Flash": 230,
			"Qwen3.5 122B": 240,
			"Qwen3 32B": 241
		};
		function compareGroups(a, b) {
			if (a.manufacturer === b.manufacturer) return 0;
			if (a.manufacturer === "其他") return 1;
			if (b.manufacturer === "其他") return -1;
			const ra = MANUFACTURER_FAME[a.manufacturer];
			const rb = MANUFACTURER_FAME[b.manufacturer];
			if (ra !== undefined && rb !== undefined) return ra - rb;
			if (ra !== undefined) return -1;
			if (rb !== undefined) return 1;
			return a.manufacturer.localeCompare(b.manufacturer);
		}
		function versionedSeriesOf(name) {
			const claude = /^Claude\s+(?:Opus|Sonnet|Fable)\s+(\d+(?:\.\d+)*)/i.exec(name);
			if (claude !== null) return {
				series: "claude",
				version: (claude[1] ?? "").split(".").map((part) => Number(part))
			};
			const match = /^([A-Za-z][A-Za-z ]*?[A-Za-z])\s*[A-Z]?(\d+(?:\.\d+)*)/.exec(name);
			if (match === null) return null;
			return {
				series: (match[1] ?? "").trim().toLowerCase(),
				version: (match[2] ?? "").split(".").map((part) => Number(part))
			};
		}
		function familyTierOf(name) {
			if (/^DeepSeek\s+V\d/i.test(name)) return {
				family: "deepseek",
				tier: /\bPro\b/i.test(name) ? 0 : /\bFlash\b/i.test(name) ? 1 : 2
			};
			if (/^GPT\s+\d/i.test(name)) {
				const tiers = [/\bSol Pro\b/i, /\bSol\b/i, /\bTerra Pro\b/i, /\bTerra\b/i, /\bLuna Pro\b/i, /\bLuna\b/i];
				const tier = tiers.findIndex((pattern) => pattern.test(name));
				return {
					family: "gpt",
					tier: tier < 0 ? tiers.length : tier
				};
			}
			if (/^Claude\s+/i.test(name)) return {
				family: "claude",
				tier: /\bFable\b/i.test(name) ? 0 : /\bOpus\b/i.test(name) ? 1 : /\bSonnet\b/i.test(name) ? 2 : 3
			};
			if (/^Qwen\d/i.test(name)) return {
				family: "qwen",
				tier: /\bMax\b/i.test(name) ? 0 : /\bPlus\b/i.test(name) ? 1 : /\b2\.4T\b/i.test(name) ? 2 : /\b27B\b/i.test(name) ? 3 : /\bFlash\b/i.test(name) ? 4 : /\bLite\b/i.test(name) ? 5 : /\bOCR\b/i.test(name) ? 6 : 7
			};
			if (/^GLM\s+\d/i.test(name)) {
				const baseName = name.replace(/^GLM\s+\d+(?:\.\d+)?/i, "").trim();
				return {
					family: "glm",
					tier: /^Turbo\b/i.test(baseName) ? 0 : baseName.length === 0 ? 1 : /^Base\b/i.test(baseName) ? 2 : 3
				};
			}
			if (/^MiMo\s+V\d/i.test(name)) return {
				family: "mimo",
				tier: /\bPro\b/i.test(name) ? 0 : 1
			};
			return null;
		}
		function compareFamilyTier(a, b) {
			const at = familyTierOf(a);
			const bt = familyTierOf(b);
			if (at === null || bt === null || at.family !== bt.family) return 0;
			return at.tier - bt.tier;
		}
		function compareReleaseVariant(a, b) {
			const av = versionedSeriesOf(a);
			const bv = versionedSeriesOf(b);
			const at = familyTierOf(a);
			const bt = familyTierOf(b);
			if (av === null || bv === null || av.series !== bv.series || at?.tier !== bt?.tier) return 0;
			const statusRank = (name) => /预览版|\bPreview\b/i.test(name) ? 1 : /快照|\bSnapshot\b/i.test(name) ? 2 : 0;
			const status = statusRank(a) - statusRank(b);
			if (status !== 0) return status;
			if (statusRank(a) !== 2) {
				const fastRank = (name) => /\((?:Fast)\)|\bHighspeed\b/i.test(name) ? 1 : 0;
				return fastRank(a) - fastRank(b);
			}
			const snapshotNumber = (name) => Number(/(\d{4,8})(?=快照|\s+Snapshot)/i.exec(name)?.[1] ?? 0);
			return snapshotNumber(b) - snapshotNumber(a);
		}
		function compareSeriesVersions(a, b) {
			const av = versionedSeriesOf(a);
			const bv = versionedSeriesOf(b);
			if (av === null || bv === null || av.series !== bv.series) return 0;
			const width = Math.max(av.version.length, bv.version.length);
			for (let index = 0; index < width; index += 1) {
				const partA = av.version[index] ?? 0;
				const partB = bv.version[index] ?? 0;
				if (partA !== partB) return partB - partA;
			}
			return 0;
		}
		function compareEntries(a, b) {
			if (a.name === b.name) return 0;
			const aFamily = familyTierOf(a.name);
			const bFamily = familyTierOf(b.name);
			if (aFamily?.family === "claude" && bFamily?.family === "claude") {
				const tierOrder = compareFamilyTier(a.name, b.name);
				if (tierOrder !== 0) return tierOrder;
			}
			const versionOrder = compareSeriesVersions(a.name, b.name);
			if (versionOrder !== 0) return versionOrder;
			const tierOrder = compareFamilyTier(a.name, b.name);
			if (tierOrder !== 0) return tierOrder;
			const releaseOrder = compareReleaseVariant(a.name, b.name);
			if (releaseOrder !== 0) return releaseOrder;
			const ra = MODEL_FAME[a.name];
			const rb = MODEL_FAME[b.name];
			if (ra !== undefined && rb !== undefined) return ra - rb;
			if (ra !== undefined) return -1;
			if (rb !== undefined) return 1;
			return a.name.localeCompare(b.name);
		}
		function offeringSelected(current, offering) {
			return current !== null && current.provider === offering.provider && current.model === offering.model.id;
		}
		//#endregion
		//#region arrangement.ts — user-picked catalog arrangement (settings → configForms)
		/**
		* The directory's arrangement is a user choice surfaced through the entry's
		* settings form (host Config `arrangement`). The form's committed value is
		* mirrored into this module-level store; ModelSelect subscribes so a change
		* regroups the open/next menu without a reload, and the /model popup reads
		* the current value when its options are computed.
		*/
		const ARRANGEMENTS = ["manufacturer", "provider", "name"];
		const arrangementListeners = new Set();
		let arrangementValue = "manufacturer";
		const arrangementStore = {
			get: () => arrangementValue,
			set: (value) => {
				if (ARRANGEMENTS.includes(value) === false || value === arrangementValue) return;
				arrangementValue = value;
				for (const listener of [...arrangementListeners]) listener();
			},
			subscribe: (listener) => {
				arrangementListeners.add(listener);
				return () => {
					arrangementListeners.delete(listener);
				};
			}
		};
		function useArrangement() {
			return (0, react.useSyncExternalStore)(arrangementStore.subscribe, arrangementStore.get);
		}
		/**
		* Manual ordering mirrors of the entry's `order` / `groupOrder` config
		* fields — canonical model names and rendered group keys in the user's
		* chosen sequence. Same store shape as the arrangement mirror.
		*/
		const orderListeners = new Set();
		let orderValue = [];
		const orderStore = {
			get: () => orderValue,
			set: (value) => {
				if (Array.isArray(value) === false) return;
				if (value.length === orderValue.length && value.every((item, index) => item === orderValue[index])) return;
				orderValue = [...value];
				for (const listener of [...orderListeners]) listener();
			},
			subscribe: (listener) => {
				orderListeners.add(listener);
				return () => {
					orderListeners.delete(listener);
				};
			}
		};
		function useOrder() {
			return (0, react.useSyncExternalStore)(orderStore.subscribe, orderStore.get);
		}
		const groupOrderListeners = new Set();
		let groupOrderValue = [];
		const groupOrderStore = {
			get: () => groupOrderValue,
			set: (value) => {
				if (Array.isArray(value) === false) return;
				if (value.length === groupOrderValue.length && value.every((item, index) => item === groupOrderValue[index])) return;
				groupOrderValue = [...value];
				for (const listener of [...groupOrderListeners]) listener();
			},
			subscribe: (listener) => {
				groupOrderListeners.add(listener);
				return () => {
					groupOrderListeners.delete(listener);
				};
			}
		};
		function useGroupOrder() {
			return (0, react.useSyncExternalStore)(groupOrderStore.subscribe, groupOrderStore.get);
		}
		/** Provider-first arrangement: one group per provider in declared order, each holding its own models. */
		function providerCatalogOf(offerings) {
			const byProvider = new Map();
			for (const offering of offerings) {
				let models = byProvider.get(offering.provider);
				if (models === undefined) {
					models = [];
					byProvider.set(offering.provider, models);
				}
				models.push({
					name: canonicalModelName(offering.model.name),
					offerings: [offering]
				});
			}
			return [...byProvider.entries()].map(([provider, models]) => {
				models.sort(compareEntries);
				return {
					// Two providers may share a display name; the row key stays the
					// opaque provider id so React keys/aria ids never collide.
					key: provider,
					manufacturer: models[0].offerings[0].providerName,
					models
				};
			});
		}
		/** Flat arrangement: every canonical name in one group, sorted alphabetically; duplicates across providers still merge. */
		function nameCatalogOf(offerings, allLabel) {
			const byName = new Map();
			for (const offering of offerings) {
				const name = canonicalModelName(offering.model.name);
				let entry = byName.get(name);
				if (entry === undefined) {
					entry = { name, offerings: [] };
					byName.set(name, entry);
				}
				entry.offerings.push(offering);
			}
			const models = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, {
				sensitivity: "base",
				numeric: true
			}));
			return [{ manufacturer: allLabel, models }];
		}
		function arrangeCatalog(offerings, arrangement, allLabel = "All") {
			const groups = arrangement === "provider" ? providerCatalogOf(offerings) : arrangement === "name" ? nameCatalogOf(offerings, allLabel) : manufacturerCatalogOf(offerings);
			return applyCustomOrder(groups, orderStore.get(), groupOrderStore.get());
		}
		/** Stable key identifying a rendered group across arrangements. */
		function catalogGroupKey(group) {
			return group.key ?? group.manufacturer;
		}
		/**
		* Layer the user's drag ordering over a computed catalog: `groupOrder`
		* ranks whole groups, `order` ranks canonical model names inside every
		* group. Entries absent from a list keep their computed relative order
		* after the ranked ones.
		*/
		function applyCustomOrder(groups, order, groupOrder) {
			if (groupOrder.length > 0 && groups.length > 1) {
				const rank = new Map(groupOrder.map((key, index) => [key, index]));
				groups = [...groups].sort((a, b) => (rank.get(catalogGroupKey(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(catalogGroupKey(b)) ?? Number.MAX_SAFE_INTEGER));
			}
			if (order.length > 0) {
				const rank = new Map(order.map((name, index) => [name, index]));
				for (const group of groups) group.models = [...group.models].sort((a, b) => (rank.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.name) ?? Number.MAX_SAFE_INTEGER));
			}
			return groups;
		}
		/** The entry's settings-form handle, captured by apply for the section's select. */
		let configFormRef = null;
		/** The client root context, captured by apply so the section can re-look-up the form lazily. */
		let clientCtxRef = null;
		function configFormGet() {
			if (configFormRef !== null) return configFormRef;
			if (clientCtxRef === null) return null;
			try {
				const form = clientCtxRef.configForms.get("ui-model-selection");
				if (form !== undefined && form !== null) configFormRef = form;
				return configFormRef;
			} catch {
				return null;
			}
		}
		/** Settings section surface: one labelled row with an arrangement select. */
		const ARRANGE_CSS = ".dsh-ms-section{padding:16px 0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}.dsh-ms-row{display:flex;align-items:center;gap:12px}.dsh-ms-label{flex:none}.dsh-ms-select{height:32px;min-width:180px;padding:0 8px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;cursor:pointer}.dsh-ms-hint{margin:6px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.dsh-ms-subhead{margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}.dsh-ms-state{padding:18px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-tertiary);font-size:13px}.dsh-ms-list{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);overflow:hidden auto;max-height:460px;background:var(--dsw-alias-bg-layer-1)}.dsh-ms-group+.dsh-ms-group{border-top:2px solid var(--dsw-alias-border-l2)}.dsh-ms-group-head{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--dsw-alias-bg-layer-2);font-weight:600;font-size:13px;cursor:grab;user-select:none}.dsh-ms-item{display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid var(--dsw-alias-border-l2);font-size:13px;cursor:grab;user-select:none}.dsh-ms-item:hover,.dsh-ms-group-head:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-ms-grip{color:var(--dsw-alias-label-tertiary);flex:none;cursor:grab}.dsh-ms-name{flex:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-ms-providers{margin-left:auto;padding-left:12px;color:var(--dsw-alias-label-tertiary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-ms-count{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-weight:400;font-size:12px}.dsh-ms-group-name{flex:none}.dsh-ms-dragging{opacity:.4}.dsh-ms-over{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary)}.dsh-ms-reset{height:28px;padding:0 10px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}.dsh-ms-reset:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}";
		function injectArrangeCss() {
			const tagId = "@deepseek-ai/dsh-client-ui-model-selection/ArrangeSection.css";
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-model-selection";
				tag.dataset.pluginCss = tagId;
				tag.textContent = ARRANGE_CSS;
				document.head.appendChild(tag);
			}
		}
		const EMPTY_SUBSCRIBE = () => () => {};
		const EMPTY_SNAPSHOT = () => null;
		/** Shared Host-generation catalog store, looked up lazily off the client ctx. */
		function catalogStoreGet() {
			if (clientCtxRef === null) return null;
			try {
				const service = clientCtxRef.get("modelDirectories");
				return service === void 0 || service === null ? null : service.catalog.store;
			} catch {
				return null;
			}
		}
		/**
		* Settings section surface: the arrangement select plus the live catalog —
		* model rows drag within their own group and group heads reorder whole
		* groups. Committed order persists through the entry's config form and
		* applies to the composer picker and the /model popup via arrangeCatalog.
		*/
		function ModelSelectionSection({ t }) {
			const current = useArrangement();
			const order = useOrder();
			const groupOrder = useGroupOrder();
			const store = catalogStoreGet();
			const catalogState = (0, react.useSyncExternalStore)(store === null ? EMPTY_SUBSCRIBE : store.subscribe, store === null ? EMPTY_SNAPSHOT : store.getSnapshot);
			(0, react.useEffect)(() => {
				if (store === null || clientCtxRef === null) return;
				if (store.getSnapshot().status === "idle") {
					try {
						clientCtxRef.get("modelDirectories").catalog.load().catch(() => {});
					} catch {}
				}
			}, [store]);
			const catalogValue = catalogState === null || catalogState === void 0 ? null : catalogState.value;
			const catalogStatus = catalogState === null || catalogState === void 0 ? "loading" : catalogState.status;
			const groups = (0, react.useMemo)(() => catalogValue === null ? [] : arrangeCatalog(offeringsOf(catalogValue.groups), current, t("group.all")), [catalogValue, current, order, groupOrder, t]);
			const [dragging, setDragging] = (0, react.useState)(null);
			const [dropTarget, setDropTarget] = (0, react.useState)(null);
			const dragRef = (0, react.useRef)(null);
			const setField = (field, value) => {
				const form = configFormGet();
				if (form !== null) {
					try {
						form.set(field, value);
					} catch {}
				}
			};
			const endDrag = () => {
				dragRef.current = null;
				setDragging(null);
				setDropTarget(null);
			};
			const onChange = (event) => {
				const next = event.target.value;
				setField("arrangement", next);
				arrangementStore.set(next);
			};
			const onReset = () => {
				setField("order", []);
				setField("groupOrder", []);
				orderStore.set([]);
				groupOrderStore.set([]);
			};
			/** Persist the whole flat visible sequence with the dragged name moved onto the target's slot. */
			const commitModelMove = (groupKey, targetName) => {
				const drag = dragRef.current;
				if (drag === null || drag.kind !== "model" || drag.groupKey !== groupKey || drag.name === targetName) return;
				const flat = [];
				for (const group of groups) for (const entry of group.models) flat.push(entry.name);
				const from = flat.indexOf(drag.name);
				const to = flat.indexOf(targetName);
				if (from === -1 || to === -1) return;
				flat.splice(from, 1);
				flat.splice(to, 0, drag.name);
				setField("order", flat);
				orderStore.set(flat);
			};
			const commitGroupMove = (targetKey) => {
				const drag = dragRef.current;
				if (drag === null || drag.kind !== "group" || drag.key === targetKey) return;
				const keys = groups.map((group) => catalogGroupKey(group));
				const from = keys.indexOf(drag.key);
				const to = keys.indexOf(targetKey);
				if (from === -1 || to === -1) return;
				keys.splice(from, 1);
				keys.splice(to, 0, drag.key);
				setField("groupOrder", keys);
				groupOrderStore.set(keys);
			};
			const groupChildren = [];
			for (const group of groups) {
				const gkey = catalogGroupKey(group);
				const headKey = `group:${gkey}`;
				const rows = [];
				for (const entry of group.models) {
					const rowKey = `model:${gkey}:${entry.name}`;
					rows.push((0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ms-item" + (dropTarget === rowKey ? " dsh-ms-over" : "") + (dragging === rowKey ? " dsh-ms-dragging" : ""),
						draggable: true,
						title: t("settings.dragModel"),
						onDragStart: (event) => {
							dragRef.current = { kind: "model", groupKey: gkey, name: entry.name };
							setDragging(rowKey);
							event.dataTransfer.effectAllowed = "move";
							event.dataTransfer.setData("text/plain", entry.name);
						},
						onDragOver: (event) => {
							const drag = dragRef.current;
							if (drag === null || drag.kind !== "model" || drag.groupKey !== gkey || drag.name === entry.name) return;
							event.preventDefault();
							event.dataTransfer.dropEffect = "move";
							if (dropTarget !== rowKey) setDropTarget(rowKey);
						},
						onDrop: (event) => {
							event.preventDefault();
							commitModelMove(gkey, entry.name);
							endDrag();
						},
						onDragEnd: endDrag,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ms-grip",
							"aria-hidden": true,
							children: "⠿"
						}), (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ms-name",
							children: entry.name
						}), (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ms-providers",
							children: entry.offerings.map((offering) => offering.providerName).join(" · ")
						})]
					}, entry.name));
				}
				groupChildren.push((0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-ms-group",
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-ms-group-head" + (dropTarget === headKey ? " dsh-ms-over" : "") + (dragging === headKey ? " dsh-ms-dragging" : ""),
						draggable: groups.length > 1,
						title: groups.length > 1 ? t("settings.dragGroup") : void 0,
						onDragStart: (event) => {
							if (groups.length <= 1) return;
							dragRef.current = { kind: "group", key: gkey };
							setDragging(headKey);
							event.dataTransfer.effectAllowed = "move";
						},
						onDragOver: (event) => {
							const drag = dragRef.current;
							if (drag === null) return;
							if (drag.kind === "group" && drag.key !== gkey) {
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								if (dropTarget !== headKey) setDropTarget(headKey);
								return;
							}
							if (drag.kind === "model" && drag.groupKey === gkey) {
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								if (dropTarget !== headKey) setDropTarget(headKey);
							}
						},
						onDrop: (event) => {
							event.preventDefault();
							const drag = dragRef.current;
							if (drag !== null && drag.kind === "model" && drag.groupKey === gkey && group.models.length > 0) commitModelMove(gkey, group.models[0].name);
							else commitGroupMove(gkey);
							endDrag();
						},
						onDragEnd: endDrag,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ms-grip",
							"aria-hidden": true,
							children: "⠿"
						}), (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ms-group-name",
							children: group.manufacturer
						}), (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-ms-count",
							children: t("settings.count", { count: group.models.length })
						})]
					}), rows]
				}, gkey));
			}
			let body;
			if (store === null || catalogStatus === "idle" || catalogStatus === "loading") {
				body = (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-ms-state",
					children: t("settings.loadingCatalog")
				});
			} else if (catalogStatus === "error") {
				body = (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-ms-state",
					children: [t("option.loadError", { message: catalogState.error ?? "" }), " ", (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ms-reset",
						onClick: () => {
							try {
								clientCtxRef.get("modelDirectories").catalog.load().catch(() => {});
							} catch {}
						},
						children: t("action.reload")
					})]
				});
			} else if (groups.length === 0) {
				body = (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-ms-state",
					children: t("empty.models")
				});
			} else {
				body = (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-ms-list",
					children: groupChildren
				});
			}
			const hasCustom = order.length > 0 || groupOrder.length > 0;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-ms-section",
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-ms-row",
					children: [(0, react_jsx_runtime.jsx)("label", {
						className: "dsh-ms-label",
						children: t("settings.arrangement")
					}), (0, react_jsx_runtime.jsx)("select", {
						className: "dsh-ms-select",
						value: current,
						onChange,
						children: ARRANGEMENTS.map((value) => (0, react_jsx_runtime.jsx)("option", {
							value,
							children: t(`arrangement.${value}`)
						}, value))
					}), hasCustom ? (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-ms-reset",
						onClick: onReset,
						children: t("settings.resetOrder")
					}) : null]
				}), (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-ms-hint",
					children: t("settings.arrangementHint")
				}), (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-ms-subhead",
					children: t("settings.models")
				}), body, (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-ms-hint",
					children: t("settings.modelsHint")
				})]
			});
		}
		//#endregion
		//#region effort-ladder.ts (ported from dsh-rc2 — six-level reasoning slider)
		const EFFORT_LADDER = ["off", "low", "medium", "high", "max", "ultra"];
		const EFFORT_LEVEL_NAME = {
			off: "Off",
			low: "Low",
			medium: "Medium",
			high: "High",
			max: "Max",
			ultra: "Ultra"
		};
		function effortLadderOf(reasoning) {
			if (reasoning === undefined || reasoning.efforts.length === 0) return undefined;
			const advertised = new Set(reasoning.efforts.map((effort) => effort.id));
			return EFFORT_LADDER.map((level) => ({
				level,
				label: EFFORT_LEVEL_NAME[level],
				wire: level,
				native: advertised.has(level)
			}));
		}
		const KNOWN_POSITION = {
			off: 0,
			minimal: 0.5,
			low: 1,
			medium: 2,
			high: 3,
			xhigh: 3.5,
			max: 4,
			ultra: 5
		};
		function ladderPosition(step) {
			return EFFORT_LADDER.indexOf(step.level);
		}
		function ladderStepForCurrent(ladder, effectiveEffort) {
			if (ladder.length === 0) return undefined;
			if (effectiveEffort === undefined) return ladder[0];
			const byName = ladder.find((step) => step.level === effectiveEffort);
			if (byName !== undefined) return byName;
			const position = KNOWN_POSITION[effectiveEffort];
			if (position === undefined) return ladder[0];
			let best = ladder[0];
			let bestDistance = Math.abs(ladderPosition(best) - position);
			for (const step of ladder) {
				const distance = Math.abs(ladderPosition(step) - position);
				if (distance < bestDistance || distance === bestDistance && ladderPosition(step) > ladderPosition(best)) {
					best = step;
					bestDistance = distance;
				}
			}
			return best;
		}
		//#endregion
		//#region provider details + health marks (ported from dsh-rc2)
		const PROVIDER_DETAILS = {
			scnet: { kind: "subscription", label: "订阅计划", source: "超算互联网 SCNet Token Plan", note: "Token Plan 仅包含手册列出的14个模型；健康与余额以实时请求为准。" },
			"scnet-glm-base": { kind: "subscription", label: "独立资源包", source: "超算互联网 SCNet GLM Base", note: "GLM-5.2-Base/GLM-5-Base 与 Token Plan 分开计费。" },
			tokenrouter: { kind: "subscription", label: "订阅计划", source: "TokenRouter", note: "免费或订阅 Token 计划。" },
			orcarouter: { kind: "subscription", label: "免费计划", source: "OrcaRouter 免费", note: "免费容量可能限流，429 时以实时健康标记为准。" },
			"deepseek-webfree": { kind: "subscription", label: "网页计划", source: "DeepSeek Web 网页版", note: "经 ds-free-api 中转；快速归入 V4 Flash，专家归入 V4 Pro。" },
			"deepseek-official": { kind: "pay-as-you-go", label: "按量计费", source: "DeepSeek 官方 API", note: "官方 API 按 token 计费；账户状态以实时健康标记为准。" },
			openrouter: { kind: "pay-as-you-go", label: "按量计费", source: "OpenRouter", note: "多模型聚合平台，价格与可用性随上游变化。" },
			holysheep: { kind: "pay-as-you-go", label: "按量计费", source: "HolySheep", note: "按量计费聚合服务。" },
			"opencode-go": { kind: "pay-as-you-go", label: "按量计费", source: "OpenCode Go", note: "按量计费聚合服务。" },
			"minimax-cn": { kind: "pay-as-you-go", label: "按量计费", source: "MiniMax 官方", note: "MiniMax 官方 API。" },
			zhipu: { kind: "pay-as-you-go", label: "按量计费", source: "智谱 GLM", note: "智谱官方 API。" },
			ark: { kind: "pay-as-you-go", label: "按量计费", source: "火山方舟", note: "火山引擎方舟按量计费。" },
			bailian: { kind: "pay-as-you-go", label: "按量计费", source: "阿里百炼", note: "阿里云百炼按量或免费额度。" },
			teamo: { kind: "pay-as-you-go", label: "按量计费", source: "TeamoRouter", note: "按量计费路由服务。" },
			agnes: { kind: "pay-as-you-go", label: "按量计费", source: "Agnes AI", note: "按量计费。" },
			dlut: { kind: "pay-as-you-go", label: "网关", source: "DLUT 网关", note: "高校网关，模型名不携带网关前缀。" },
			sensenova: { kind: "pay-as-you-go", label: "按量计费", source: "商汤日日新", note: "商汤平台按量计费。" },
			"google-ai-studio": { kind: "pay-as-you-go", label: "免费额度/按量", source: "Google AI Studio", note: "额度与速率以平台为准。" },
			tokenhub: { kind: "subscription", label: "订阅计划", source: "腾讯 TokenHub", note: "腾讯 TokenHub 套餐计费。" }
		};
		const HEALTH_MARK = {
			rate_limited: { color: "#eab308", label: "限流" },
			billing: { color: "#ef4444", label: "欠费" },
			auth: { color: "#ef4444", label: "鉴权失败" },
			error: { color: "#f97316", label: "异常" },
			all_down: { color: "#ef4444", label: "全部不可用" }
		};
		function freshHealthOf(health, providerId) {
			const record = health[providerId];
			if (record === undefined || typeof record.at !== "number") return null;
			const ttlMs = (typeof record.ttlSec === "number" ? record.ttlSec : 900) * 1e3;
			return Date.now() - record.at < ttlMs ? record : null;
		}
		function providerDecoratedName(modelName, providerName, record) {
			const free = providerName.includes("免费");
			const base = free ? providerName.replace(/\s*免费\s*/g, " ").trim() : providerName;
			const mark = record === null ? null : HEALTH_MARK[record.state] ?? { color: "#f97316", label: "异常" };
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
				children: [
					`${modelName} (${base}`,
					free && (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: "#22c55e",
							fontWeight: 600
						},
						children: " 免费"
					}),
					")",
					mark !== null && (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: mark.color,
							fontWeight: 600,
							marginLeft: 4
						},
						title: `${mark.label} · ${new Date(record.at).toLocaleString()}
${record.message ?? ""}`,
						children: mark.label
					})
				]
			});
		}
		//#endregion
		//#region dsh-rc2 catalog styles (ported — manufacturer-grouped directory + effort slider)
		const cssRc2 = "._7KE1Ra_menu{width:min(560px,calc(100vw - 32px));max-height:min(720px,calc(100vh - 64px));padding:4px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}._7KE1Ra_status,._7KE1Ra_empty{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:15px;line-height:24px}._7KE1Ra_groups{min-height:0;overflow-y:auto}._7KE1Ra_providerOptions{flex:1 1 auto;min-height:0}._7KE1Ra_group+._7KE1Ra_group{margin-top:4px}._7KE1Ra_groupTitle{position:sticky;top:0;z-index:1;padding:8px 12px 5px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px;font-weight:500}._7KE1Ra_option{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:8px 12px;border-radius:10px}._7KE1Ra_modelName{overflow:hidden;color:inherit;font-size:14px;line-height:24px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}._7KE1Ra_description{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:22px;text-overflow:ellipsis;white-space:nowrap}._7KE1Ra_check{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}._7KE1Ra_cell{min-height:44px;padding:10px 12px;font-size:14px;line-height:24px}._7KE1Ra_rootPane{display:flex;align-items:center;gap:16px;padding:8px 8px 10px}._7KE1Ra_modelCell{display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;min-height:44px;height:auto;padding:10px 12px;border:none;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;line-height:24px;cursor:pointer;text-align:left}._7KE1Ra_modelCell:hover,._7KE1Ra_modelCell:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}._7KE1Ra_modelCellName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}._7KE1Ra_effortCluster{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;gap:6px;padding:4px 4px 0}._7KE1Ra_effortCaption{color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px;letter-spacing:.02em;user-select:none}._7KE1Ra_slider{--level-color:var(--dsw-alias-label-dimmed);display:flex;gap:12px;align-items:stretch;height:180px;padding:1px 0;outline:none;cursor:ns-resize;touch-action:none;user-select:none}._7KE1Ra_slider:focus-visible{border-radius:8px;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}._7KE1Ra_sliderBusy{cursor:default}._7KE1Ra_slider[data-level=off]{--level-color:var(--dsw-alias-label-dimmed)}._7KE1Ra_slider[data-level=low],._7KE1Ra_slider[data-level=medium]{--level-color:#eab308}._7KE1Ra_slider[data-level=high]{--level-color:#3b82f6}._7KE1Ra_slider[data-level=max]{--level-color:#ef4444}._7KE1Ra_slider[data-level=ultra]{--level-color:#a855f7}._7KE1Ra_track{position:relative;flex:0 0 8px;width:8px;height:100%;border-radius:999px;background:var(--dsw-alias-border-l2)}._7KE1Ra_fill{position:absolute;left:0;right:0;bottom:0;border-radius:999px;background:var(--level-color)}._7KE1Ra_slider[data-level=off] ._7KE1Ra_fill{opacity:0}._7KE1Ra_thumb{position:absolute;left:50%;width:18px;height:18px;transform:translate(-50%,50%);border:2px solid var(--dsw-specific-menu);border-radius:50%;background:var(--level-color);box-shadow:0 1px 3px rgb(0 0 0/25%)}._7KE1Ra_labels{display:flex;flex-direction:column;justify-content:space-between;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:20px;text-align:left}._7KE1Ra_levelLabel{display:flex;align-items:center;gap:2px;height:28px;white-space:nowrap}._7KE1Ra_levelLabelCurrent{color:var(--level-color);font-weight:600}._7KE1Ra_synthMark{color:var(--dsw-alias-label-dimmed);font-size:13px}._7KE1Ra_levelLabelSynth{opacity:.38}._7KE1Ra_triggerEffort[data-level=low],._7KE1Ra_triggerEffort[data-level=medium]{color:#eab308}._7KE1Ra_triggerEffort[data-level=high]{color:#3b82f6}._7KE1Ra_triggerEffort[data-level=max]{color:#ef4444}._7KE1Ra_triggerEffort[data-level=ultra]{color:#a855f7}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css='@deepseek-ai/dsh-client-ui-model-selection/rc2-catalog.css']") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-model-selection";
			tag.dataset.pluginCss = "@deepseek-ai/dsh-client-ui-model-selection/rc2-catalog.css";
			tag.textContent = cssRc2;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region lib/types/client/ModelSelect.js
		/**
		* ModelSelect: the composer's named model seat (`conversation.input.model`).
		* Two-level selection per figma 496:26454's MenuDropdown: the root menu is
		* the Model / Effort row pair (label + current value + a right chevron),
		* each drilling into its own list — the provider-grouped model list over
		* the shared directory, and the effort levels. The trigger (313:14108's
		* ToggleButton) shows both: model name + effort in the caption tone.
		* While open, ↑/↓ move focus across the rows of the shown pane (wrapping; a
		* step taken while the trigger still holds focus enters at the near end), Tab
		* settles like Enter, and Escape and Shift+Tab leave a drilled pane first and
		* otherwise close back to the trigger. A drilled pane hands focus to the row
		* of the value in use, and returning to the root pane hands it back to the
		* cell that opened it. Data and submission ride the SAME per-session
		* ModelDirectory as the /model popup; exact-model reasoning metadata and the
		* selected effort come from the Host rather than a client-owned vocabulary. A
		* rejected selection announces through the shared transient Toast anchored to
		* the composer card; the in-menu strip with Retry remains the catalog-load
		* surface. While the directory's pending selection is unsettled, the trigger
		* shows a spinner in place of its chevron, and each row whose value that
		* selection carries shows one in place of its check mark.
		*/
		/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real (Menu primitive's measure pass). */
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};
		/**
		* Render the composer model seat — dsh-rc2 port: the root pane pairs the
		* model cell (drills into the manufacturer-grouped model list) with the
		* vertical reasoning slider; a model pick closes on acceptance, an effort
		* pick keeps the menu open. Selection results ride the 0.1.7 Result
		* (ok/error) instead of rc2's boolean.
		*/
		function ModelSelect({ locked, available, directory, load, select, t }) {
			const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const [health, setHealth] = (0, react.useState)({});
			const [detailProvider, setDetailProvider] = (0, react.useState)(null);
			const [detailPos, setDetailPos] = (0, react.useState)({ x: 0, y: 0 });
			const lastActionRef = (0, react.useRef)("load");
			const [toast, setToast] = (0, react.useState)(null);
			const toastSeq = (0, react.useRef)(0);
			const [pendingEntry, setPendingEntry] = (0, react.useState)(null);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const menuRef = (0, react.useRef)(null);
			const [menuPos, setMenuPos] = (0, react.useState)(null);
			const itemRefs = (0, react.useRef)([]);
			const id = (0, react.useId)();
			const modelScrollNodeRef = (0, react.useRef)(null);
			const modelScrollTopRef = (0, react.useRef)(0);
			const holdModelScroll = (node) => {
				if (node === null) {
					const prev = modelScrollNodeRef.current;
					if (prev !== null) modelScrollTopRef.current = prev.scrollTop;
				} else if (node.scrollTop !== modelScrollTopRef.current) {
					node.scrollTop = modelScrollTopRef.current;
				}
				modelScrollNodeRef.current = node;
			};
			const offerings = (0, react.useMemo)(() => offeringsOf(state.groups), [state.groups]);
			const arrangement = useArrangement();
			const order = useOrder();
			const groupOrder = useGroupOrder();
			const catalog = (0, react.useMemo)(() => arrangeCatalog(offerings, arrangement, t("group.all")), [offerings, arrangement, order, groupOrder, t]);
			const currentChoice = offerings.find((offering) => offeringSelected(state.current, offering));
			const reasoning = currentChoice?.model.reasoning;
			const ladder = (0, react.useMemo)(() => effortLadderOf(reasoning), [reasoning]);
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const currentStep = (0, react.useMemo)(() => ladderStepForCurrent(ladder ?? [], effectiveEffort), [ladder, effectiveEffort]);
			const effortLabel = reasoning === undefined ? state.retainedEffort : effectiveEffort === undefined ? t("effort.providerDefault") : currentStep?.label ?? effectiveEffort;
			const { pending } = state;
			const busy = pending !== null || state.status === "selecting";
			const reload = () => {
				lastActionRef.current = "load";
				load();
			};
			(0, react.useEffect)(() => {
				if (available) {
					lastActionRef.current = "load";
					load();
				}
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (rootRef.current?.contains(event.target) === true) return;
					if (menuRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open || globalThis.fetch === undefined) return;
				let dead = false;
				globalThis.fetch("/provider-health", { cache: "no-store" }).then(async (response) => response.json()).then((data) => {
					if (!dead) setHealth(data.providers ?? {});
				}).catch(() => {});
				return () => {
					dead = true;
				};
			}, [open]);
			const paneFocus = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const intent = paneFocus.current;
				paneFocus.current = null;
				if (!open || intent === null) return;
				if (intent === "drill") {
					(menuRef.current?.querySelector("[role=\"menuitemradio\"][aria-checked=\"true\"]:not([disabled])") ?? itemRefs.current.find((item) => item !== null && !item.disabled) ?? triggerRef.current)?.focus();
					return;
				}
				const cell = itemRefs.current[intent === "provider" ? 0 : intent];
				(typeof intent === "number" && cell !== null && cell !== void 0 && !cell.disabled ? cell : itemRefs.current[0] ?? triggerRef.current)?.focus();
			}, [open, pane]);
			(0, react.useLayoutEffect)(() => {
				if (!open) {
					setMenuPos(null);
					return;
				}
				const place = () => {
					const rect = triggerRef.current?.getBoundingClientRect();
					if (rect === void 0) return;
					const MARGIN = 12;
					const lw = menuRef.current?.offsetWidth ?? 0;
					const lh = menuRef.current?.offsetHeight ?? 0;
					let x = rect.right - lw;
					let y = rect.top - 8 - lh;
					if (lw > 0) x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN);
					if (lh > 0) y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN);
					setMenuPos({ left: x, top: y });
				};
				place();
				window.addEventListener("scroll", place, true);
				window.addEventListener("resize", place);
				return () => {
					window.removeEventListener("scroll", place, true);
					window.removeEventListener("resize", place);
				};
			}, [open, pane, state, catalog.length]);
			if (!available) return null;
			const show = () => {
				triggerRef.current?.focus();
				if (state.current === null) paneFocus.current = "drill";
				setPane(state.current === null ? "model" : "root");
				setPendingEntry(null);
				modelScrollTopRef.current = 0;
				setOpen(true);
				reload();
			};
			const close = (restoreFocus = false) => {
				setOpen(false);
				setPane("root");
				setPendingEntry(null);
				setDetailProvider(null);
				modelScrollTopRef.current = 0;
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const drill = (next) => {
				paneFocus.current = "drill";
				setMenuPos(null);
				setPane(next);
			};
			const back = (to) => {
				paneFocus.current = to === "root" ? 0 : "drill";
				setMenuPos(null);
				setPane(to);
			};
			const moveFocus = (offset) => {
				const items = itemRefs.current.filter((item) => item !== null);
				if (items.length === 0) return;
				const active = items.findIndex((item) => item === document.activeElement);
				items[active === -1 ? offset > 0 ? 0 : items.length - 1 : (active + offset + items.length) % items.length]?.focus();
			};
			const onRootKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane === "provider") back("model");
					else if (pane !== "root" && state.current !== null) back("root");
					else if (pane !== "root") back("root");
					else close(true);
					return;
				}
				if (!open) return;
				if (event.key === "Tab") {
					if (event.shiftKey) {
						event.preventDefault();
						if (pane === "provider") back("model");
						else if (pane !== "root" && state.current !== null) back("root");
						else close(true);
						return;
					}
					const focused = document.activeElement;
					const rows = itemRefs.current.filter((item) => item !== null);
					if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
						event.preventDefault();
						focused.click();
						return;
					}
					if (focused !== triggerRef.current) return;
					event.preventDefault();
					(menuRef.current?.querySelector("[role=\"menuitemradio\"][aria-checked=\"true\"]:not([disabled])") ?? rows.find((item) => !item.disabled))?.focus();
					return;
				}
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};
			const onBlur = (event) => {
				if (event.relatedTarget === null || event.relatedTarget === void 0) return;
				if (event.relatedTarget === null || event.relatedTarget === void 0) return; /* dsh-tauri: keep the model menu mounted through a WebKit blur */
				if (event.relatedTarget instanceof Node && (rootRef.current?.contains(event.relatedTarget) === true || menuRef.current?.contains(event.relatedTarget) === true)) return;
				close();
			};
			const announceFailure = () => {
				const message = directory.getSnapshot().error;
				if (message !== null) {
					toastSeq.current += 1;
					setToast({
						seq: toastSeq.current,
						text: t("error.action", { message })
					});
				}
			};
			const settleSelection = (result) => {
				if (result === void 0) return;
				if (result.ok) {
					if (rootRef.current !== null) close(true);
					return;
				}
				const { error } = result;
				toastSeq.current += 1;
				setToast({
					seq: toastSeq.current,
					text: error.code === "session/writer-held" ? t("error.sessionInUse") : t("error.action", { message: `${error.code}: ${error.message}` })
				});
			};
			const submit = (selection) => {
				lastActionRef.current = "select";
				triggerRef.current?.focus();
				select(selection).then(settleSelection);
			};
			const choose = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					close(true);
					return;
				}
				submit(selection);
			};
			const chooseEffort = (level) => {
				if (state.current === null || ladder === undefined) return Promise.resolve(false);
				const step = ladder.find((candidate) => candidate.level === level);
				if (step === undefined) return Promise.resolve(false);
				if (currentStep?.level === level && effectiveEffort === step.wire) return Promise.resolve(true);
				lastActionRef.current = "select";
				return select({
					provider: state.current.provider,
					model: state.current.model,
					reasoningEffort: step.wire
				}).then((result) => {
					const accepted = result !== undefined && result !== void 0 && result.ok === true;
					if (!accepted) {
						const { error } = result ?? { error: { code: "unavailable", message: "selection rejected" } };
						toastSeq.current += 1;
						setToast({
							seq: toastSeq.current,
							text: error.code === "session/writer-held" ? t("error.sessionInUse") : t("error.action", { message: `${error.code}: ${error.message}` })
						});
					}
					return accepted;
				});
			};
			const pickModelEntry = (entry) => {
				const offering = entry.offerings[0];
				if (entry.offerings.length === 1 && offering !== undefined) {
					choose({
						provider: offering.provider,
						model: offering.model.id,
						...offering.model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: offering.model.reasoning.defaultEffort }
					});
					return;
				}
				setPendingEntry(entry);
				setMenuPos(null);
				paneFocus.current = "drill";
				setPane("provider");
			};
			const waiting = state.current === null && state.status === "loading";
			const modelLabel = waiting ? t("trigger.loading") : currentChoice === undefined ? state.current === null ? t("trigger.fallback") : `${state.current.provider}/${state.current.model}` : modelWithProvider(canonicalModelName(currentChoice.model.name), currentChoice.providerName);
			const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`;
			const triggerAria = waiting ? t("trigger.loading") : state.current === null ? t("trigger.selectAria") : effortLabel === undefined ? t("trigger.aria", { model: modelLabel }) : t("trigger.ariaEffort", {
				model: modelLabel,
				effort: effortLabel
			});
			itemRefs.current = [];
			let itemIndex = 0;
			const itemRef = () => {
				const at = itemIndex++;
				return (node) => {
					itemRefs.current[at] = node;
				};
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: ModelSelect_module_css_default.root,
				onKeyDown: onRootKeyDown,
				onBlur,
				onMouseDown: (event) => {
					if (event.target instanceof Element && event.target.closest("button") !== null) event.preventDefault();
				},
				children: [
					(0, react_jsx_runtime.jsxs)("button", {
						ref: triggerRef,
						type: "button",
						className: ModelSelect_module_css_default.trigger,
						"aria-label": triggerAria,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-controls": open ? `${id}-menu` : void 0,
						title: triggerLabel,
						"aria-busy": busy,
						disabled: locked,
						onClick: () => {
							if (open) close(true);
							else show();
						},
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: ModelSelect_module_css_default.triggerLabel,
								children: modelLabel
							}),
							effortLabel !== undefined && (0, react_jsx_runtime.jsx)("span", {
								className: ModelSelect_module_css_default.triggerEffort,
								"data-level": currentStep?.level ?? "off",
								children: effortLabel
							}),
							busy ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: clsx(ModelSelect_module_css_default.chevron, open && ModelSelect_module_css_default.chevronOpen) })
						]
					}),
					open && (0, react_dom.createPortal)((0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
						ref: menuRef,
						id: `${id}-menu`,
						className: ModelSelect_module_css_default.menu,
						style: menuPos ?? MEASURE_STYLE,
						role: "menu",
						"aria-label": t("menu.aria"),
						"aria-busy": state.status === "loading" || busy,
						children: [
							pane === "root" && (0, react_jsx_runtime.jsxs)("div", {
								className: ModelSelect_module_css_default.rootPane,
								children: [
									(0, react_jsx_runtime.jsxs)("button", {
										ref: itemRef(),
										type: "button",
										role: "menuitem",
										className: ModelSelect_module_css_default.modelCell,
										onClick: () => {
											drill("model");
										},
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: ModelSelect_module_css_default.modelCellName,
												children: modelLabel
											}),
											(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { className: ModelSelect_module_css_default.cellChevron })
										]
									}),
									ladder !== undefined && currentStep !== undefined && (0, react_jsx_runtime.jsx)(EffortSlider, {
										ladder,
										current: currentStep,
										busy,
										onPick: chooseEffort,
										t
									})
								]
							}),
							pane === "model" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								state.status === "loading" && (0, react_jsx_runtime.jsx)("div", {
									className: ModelSelect_module_css_default.status,
									children: t("status.loading")
								}),
								state.error !== null && lastActionRef.current === "load" && (0, react_jsx_runtime.jsxs)("div", {
									className: ModelSelect_module_css_default.error,
									children: [(0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}),
								state.failures.map((failure) => (0, react_jsx_runtime.jsxs)("div", {
									className: ModelSelect_module_css_default.warning,
									children: [(0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", {
										name: failure.id === "deepseek-account" ? t("provider.account") : failure.name,
										message: failure.message
									}) }), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}, failure.id)),
								catalog.length > 0 && (0, react_jsx_runtime.jsx)("div", {
									ref: holdModelScroll,
									className: clsx(ModelSelect_module_css_default.groups, "scrollable"),
									children: catalog.map((group) => {
										const groupKey = group.key ?? group.manufacturer;
										const headingId = `${id}-${groupKey}`;
										return (0, react_jsx_runtime.jsxs)("section", {
											role: "group",
											"aria-labelledby": headingId,
											className: ModelSelect_module_css_default.group,
											children: [(0, react_jsx_runtime.jsx)("div", {
												className: ModelSelect_module_css_default.groupTitle,
												id: headingId,
												children: group.manufacturer
											}), group.models.map((entry) => {
												const selected = entry.offerings.some((offering) => offeringSelected(state.current, offering));
												const multi = entry.offerings.length > 1;
												const singleOffering = multi ? undefined : entry.offerings[0];
												// Under provider grouping the heading already names the
												// provider, so the suffix on a single-source row is noise.
												const rowLabel = singleOffering === undefined || (arrangement === "provider") ? entry.name : modelWithProvider(entry.name, singleOffering.providerName);
												const rowTitle = singleOffering === undefined ? entry.name : modelWithProvider(entry.name, singleOffering.providerName);
												const pendingHere = pending !== null && pending !== undefined && entry.offerings.some((offering) => offering.provider === pending.provider && offering.model.id === pending.model);
												return (0, react_jsx_runtime.jsxs)("button", {
													ref: itemRef(),
													type: "button",
													role: "menuitemradio",
													"aria-checked": selected,
													className: clsx(ModelSelect_module_css_default.option, selected && ModelSelect_module_css_default.selected),
													title: rowTitle,
													disabled: busy,
													onClick: () => {
														pickModelEntry(entry);
													},
													children: [(0, react_jsx_runtime.jsxs)("span", {
														className: ModelSelect_module_css_default.optionCopy,
														children: [
															(0, react_jsx_runtime.jsx)("span", {
																className: ModelSelect_module_css_default.modelName,
																children: rowLabel
															}),
															multi && (0, react_jsx_runtime.jsx)("span", {
																className: ModelSelect_module_css_default.description,
																children: `${entry.offerings.length} 个提供商`
															})
														]
													}), (0, react_jsx_runtime.jsx)("span", {
														className: ModelSelect_module_css_default.check,
														children: pendingHere ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : selected ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {}) : multi ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {}) : null
													})]
												}, `${groupKey}/${entry.name}`);
											})]
										}, groupKey);
									})
								}),
								state.status === "ready" && catalog.length === 0 && (0, react_jsx_runtime.jsx)("div", {
									className: ModelSelect_module_css_default.empty,
									children: t("empty.models")
								})
							] }),
							pane === "provider" && pendingEntry !== null && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(0, react_jsx_runtime.jsxs)("button", {
									ref: itemRef(),
									type: "button",
									role: "menuitem",
									className: ModelSelect_module_css_default.cell,
									onClick: () => {
										back("model");
									},
									children: [
										(0, react_jsx_runtime.jsx)("span", {
											className: ModelSelect_module_css_default.cellLabel,
											children: "← 返回模型"
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: ModelSelect_module_css_default.cellValue,
											children: pendingEntry.name
										})
									]
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: clsx(ModelSelect_module_css_default.groups, ModelSelect_module_css_default.providerOptions, "scrollable"),
									children: pendingEntry.offerings.map((offering) => {
										const selected = offeringSelected(state.current, offering);
										const pendingHere = pending !== null && pending !== undefined && pending.provider === offering.provider && pending.model === offering.model.id;
										return (0, react_jsx_runtime.jsxs)("button", {
											ref: itemRef(),
											type: "button",
											role: "menuitemradio",
											"aria-checked": selected,
											className: clsx(ModelSelect_module_css_default.option, selected && ModelSelect_module_css_default.selected),
											disabled: busy,
											onContextMenu: (event) => {
												event.preventDefault();
												event.stopPropagation();
												const detail = PROVIDER_DETAILS[offering.provider] ?? {
													kind: "unknown",
													label: "未知",
													source: offering.provider,
													note: "暂无详情信息。"
												};
												setDetailPos({ x: event.clientX, y: event.clientY });
												setDetailProvider({ ...detail, provider: offering.provider, model: offering.model.id });
											},
											onClick: () => {
												choose({
													provider: offering.provider,
													model: offering.model.id,
													...offering.model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: offering.model.reasoning.defaultEffort }
												});
											},
											children: [
												(0, react_jsx_runtime.jsxs)("span", {
													className: ModelSelect_module_css_default.optionCopy,
													children: [
														(0, react_jsx_runtime.jsx)("span", {
															className: ModelSelect_module_css_default.modelName,
															children: providerDecoratedName(pendingEntry.name, offering.providerName, freshHealthOf(health, offering.provider))
														}),
														(0, react_jsx_runtime.jsx)("span", {
															className: ModelSelect_module_css_default.description,
															children: offering.model.id
														})
													]
												}),
												(0, react_jsx_runtime.jsx)("span", {
													className: ModelSelect_module_css_default.check,
													children: pendingHere ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : selected ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {}) : null
												})
											]
										}, `${offering.provider}/${offering.model.id}`);
									})
								})
							] })
						]
					}), document.body),
					detailProvider !== null && (0, react_jsx_runtime.jsxs)("div", {
						"data-dsh-provider-detail": true,
						style: {
							position: "fixed",
							left: Math.min(detailPos.x + 12, window.innerWidth - 340),
							top: Math.min(detailPos.y + 12, window.innerHeight - 210),
							zIndex: 9999,
							width: 320,
							maxWidth: "90vw",
							background: "var(--dsh-surface, #1e1e24)",
							border: "1px solid var(--dsh-border, #333)",
							borderRadius: 10,
							padding: "14px 16px",
							boxShadow: "0 8px 30px rgba(0,0,0,.5)",
							color: "var(--dsh-text, #eee)"
						},
						onMouseDown: (event) => {
							event.stopPropagation();
						},
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": "关闭提供商详情",
								onClick: () => {
									setDetailProvider(null);
								},
								style: { float: "right" },
								children: "×"
							}),
							(0, react_jsx_runtime.jsx)("div", {
								style: {
									fontWeight: 700,
									marginBottom: 8
								},
								children: detailProvider.source
							}),
							(0, react_jsx_runtime.jsx)("div", {
								style: {
									marginBottom: 6
								},
								children: `${detailProvider.label} · ${detailProvider.provider}`
							}),
							(0, react_jsx_runtime.jsx)("div", {
								style: {
									opacity: 0.78,
									fontSize: 13,
									marginBottom: 8
								},
								children: detailProvider.model
							}),
							(0, react_jsx_runtime.jsx)("div", {
								style: { lineHeight: 1.45 },
								children: detailProvider.note
							})
						]
					}),
					toast !== null && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
						text: toast.text,
						icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutlineRegular, {}),
						anchor: rootRef.current?.closest("[data-composer-card]") ?? null,
						onDone: () => {
							setToast(null);
						}
					}, toast.seq)
				]
			});
		}
		/** The vertical reasoning slider: draggable six-level bar over the 推理等级 caption. */
		function EffortSlider({ ladder, current, busy, onPick, t }) {
			const sliderRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const [preview, setPreview] = (0, react.useState)(null);
			const indexOf = (step) => ladder.findIndex((candidate) => candidate.level === step.level);
			const currentIndex = indexOf(current);
			const shownIndex = preview ?? currentIndex;
			const shown = ladder[shownIndex] ?? current;
			(0, react.useEffect)(() => {
				if (preview !== null && preview === currentIndex) setPreview(null);
			}, [preview, currentIndex]);
			const pick = (level) => {
				const index = ladder.findIndex((candidate) => candidate.level === level);
				if (index >= 0) setPreview(index);
				const settled = onPick(level);
				if (typeof settled === "boolean") {
					if (!settled) setPreview(null);
					return;
				}
				void settled.then((accepted) => {
					if (!accepted) setPreview(null);
				});
			};
			const levelAtY = (clientY) => {
				const element = sliderRef.current;
				if (element === null) return 0;
				const rect = element.getBoundingClientRect();
				if (rect.height <= 0) return 0;
				const ratio = (rect.bottom - clientY) / rect.height;
				const clamped = Math.min(1, Math.max(0, ratio));
				return Math.min(EFFORT_LADDER.length - 1, Math.floor(clamped * EFFORT_LADDER.length));
			};
			const beginDrag = (event) => {
				if (busy) return;
				sliderRef.current?.setPointerCapture(event.pointerId);
				dragRef.current = { pointerId: event.pointerId };
				setPreview(levelAtY(event.clientY));
			};
			const dragTo = (event) => {
				if (dragRef.current === null || dragRef.current.pointerId !== event.pointerId) return;
				setPreview(levelAtY(event.clientY));
			};
			const endDrag = (event) => {
				if (dragRef.current === null || dragRef.current.pointerId !== event.pointerId) return;
				dragRef.current = null;
				const level = EFFORT_LADDER[levelAtY(event.clientY)];
				if (level !== undefined) pick(level);
			};
			const cancelDrag = (event) => {
				if (dragRef.current !== null && dragRef.current.pointerId === event.pointerId) {
					dragRef.current = null;
					setPreview(null);
				}
			};
			const onKeyDown = (event) => {
				if (busy) return;
				const position = currentIndex;
				let next;
				if (event.key === "ArrowUp") next = Math.min(position + 1, EFFORT_LADDER.length - 1);
				else if (event.key === "ArrowDown") next = Math.max(position - 1, 0);
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = EFFORT_LADDER.length - 1;
				else return;
				event.preventDefault();
				event.stopPropagation();
				const level = EFFORT_LADDER[next];
				if (level !== undefined) pick(level);
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ModelSelect_module_css_default.effortCluster,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						ref: sliderRef,
						role: "slider",
						tabIndex: 0,
						"aria-label": t("menu.effort"),
						"aria-valuemin": 0,
						"aria-valuemax": EFFORT_LADDER.length - 1,
						"aria-valuenow": shownIndex,
						"aria-valuetext": shown.label,
						"aria-disabled": busy,
						"data-level": shown.level,
						className: clsx(ModelSelect_module_css_default.slider, busy && ModelSelect_module_css_default.sliderBusy),
						onKeyDown,
						onPointerDown: beginDrag,
						onPointerMove: dragTo,
						onPointerUp: endDrag,
						onPointerCancel: cancelDrag,
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: ModelSelect_module_css_default.track,
								"aria-hidden": true,
								children: [
									(0, react_jsx_runtime.jsx)("div", {
										className: ModelSelect_module_css_default.fill,
										style: { height: `${(shownIndex + 0.5) / EFFORT_LADDER.length * 100}%` }
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: ModelSelect_module_css_default.thumb,
										style: { bottom: `${(shownIndex + 0.5) / EFFORT_LADDER.length * 100}%` }
									})
								]
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: ModelSelect_module_css_default.labels,
								"aria-hidden": true,
								children: [...EFFORT_LADDER].reverse().map((level) => {
									const step = ladder.find((candidate) => candidate.level === level);
									if (step === undefined) return null;
									const active = step.level === shown.level;
									return (0, react_jsx_runtime.jsxs)("span", {
										className: clsx(ModelSelect_module_css_default.levelLabel, active && ModelSelect_module_css_default.levelLabelCurrent, !step.native && ModelSelect_module_css_default.levelLabelSynth),
										title: step.native ? undefined : t("effort.synthesized", { level: step.label }),
										children: [
											step.label,
											!step.native && (0, react_jsx_runtime.jsx)("span", {
												className: ModelSelect_module_css_default.synthMark,
												"aria-hidden": true,
												children: "≈"
											})
										]
									}, step.level);
								})
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: ModelSelect_module_css_default.effortCaption,
						children: t("menu.effort")
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* `model` namespace dictionaries.
		*
		* `trigger.selectAria` intentionally matches `trigger.fallback` but remains a
		* separate key: the visible fallback label and the accessible name of
		* an unset trigger are free to diverge per locale, and folding it into
		* `trigger.aria` would announce the degenerate "Select model, current Select
		* model".
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"provider.account": "DeepSeek 账号",
			"command.label": "模型",
			"command.description": "选择本会话使用的模型",
			"option.loadError": "目录加载失败：{message}",
			"option.deepseekV4Flash.description": "快速、高效且经济；适合目标明确、常规或并行任务。",
			"option.deepseekV4Pro.description": "更强的自主编码、知识与复杂推理能力；适合复杂或质量优先的任务，但成本更高。",
			"trigger.fallback": "请选择模型",
			"trigger.loading": "正在加载模型…",
			"trigger.selectAria": "请选择模型",
			"trigger.aria": "选择模型，当前 {model}",
			"trigger.ariaEffort": "选择模型，当前 {model}，推理等级 {effort}",
			"menu.aria": "模型与推理等级",
			"menu.model": "模型",
			"menu.effort": "推理等级",
			"effort.providerDefault": "Default",
			"effort.synthesized": "该模型未原生提供 {level} 档，由适配器就近映射",
			"status.loading": "正在刷新模型列表…",
			"error.action": "模型操作失败：{message}",
			"error.sessionInUse": "当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。",
			"action.reload": "重新加载",
			"warning.groupLoad": "{name} 加载失败：{message}",
			"empty.models": "没有可用的模型。",
			"empty.efforts": "当前模型未提供推理等级。",
			"group.all": "全部模型",
			"settings.nav": "模型选择器",
			"settings.arrangement": "排列方式",
			"settings.arrangementHint": "选择模型选择器中模型的分组与排序方式，改动立即生效。",
			"arrangement.manufacturer": "按厂商分组",
			"arrangement.provider": "按提供商分组",
			"arrangement.name": "按名称平铺",
			"settings.models": "可用模型",
			"settings.modelsHint": "拖动 ⠿ 手柄重排：模型在同组内上下移动，分组头拖动整组；改动立即生效并同步到选择菜单与 /model 弹窗。",
			"settings.resetOrder": "恢复默认排序",
			"settings.count": "{count} 个模型",
			"settings.loadingCatalog": "正在加载模型目录…",
			"settings.dragModel": "拖动调整顺序",
			"settings.dragGroup": "拖动调整分组顺序"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"provider.account": "DeepSeek Account",
			"command.label": "Model",
			"command.description": "Select the model for this conversation",
			"option.loadError": "Catalog failed to load: {message}",
			"option.deepseekV4Flash.description": "Fast, efficient, and economical; suited to focused, routine, or parallel tasks.",
			"option.deepseekV4Pro.description": "Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.",
			"trigger.fallback": "Select model",
			"trigger.loading": "Loading models…",
			"trigger.selectAria": "Select model",
			"trigger.aria": "Select model, current {model}",
			"trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
			"menu.aria": "Model and reasoning effort",
			"menu.model": "Model",
			"menu.effort": "Effort",
			"effort.providerDefault": "Default",
			"effort.synthesized": "This model has no native {level} level; the adapter maps it to its nearest level.",
			"status.loading": "Refreshing model list…",
			"error.action": "Model operation failed: {message}",
			"error.sessionInUse": "This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.",
			"action.reload": "Reload",
			"warning.groupLoad": "{name} failed to load: {message}",
			"empty.models": "No models available.",
			"empty.efforts": "This model provides no reasoning effort levels.",
			"group.all": "All models",
			"settings.nav": "Model Picker",
			"settings.arrangement": "Arrangement",
			"settings.arrangementHint": "How the model picker groups and orders models; applies immediately.",
			"arrangement.manufacturer": "By manufacturer",
			"arrangement.provider": "By provider",
			"arrangement.name": "Alphabetical",
			"settings.models": "Available models",
			"settings.modelsHint": "Drag the ⠿ handle to reorder models inside a group, or drag a group header to reorder whole groups; saved order applies to the picker menu and the /model popup immediately.",
			"settings.resetOrder": "Reset ordering",
			"settings.count": "{count} models",
			"settings.loadingCatalog": "Loading the model catalog…",
			"settings.dragModel": "Drag to reorder",
			"settings.dragGroup": "Drag to reorder groups"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** One selectable row's id: an opaque row key (resolved by lookup, never parsed). */
		function rowId(providerId, modelId) {
			return `${providerId}/${modelId}`;
		}
		const BUILTIN_DESCRIPTION_KEYS = {
			"deepseek-account/deepseek-v4-flash": "option.deepseekV4Flash.description",
			"deepseek-account/deepseek-v4-pro": "option.deepseekV4Pro.description",
			"deepseek-official/deepseek-v4-flash": "option.deepseekV4Flash.description",
			"deepseek-official/deepseek-v4-pro": "option.deepseekV4Pro.description"
		};
		function descriptionOf(providerId, model, t) {
			const key = BUILTIN_DESCRIPTION_KEYS[rowId(providerId, model.id)];
			return key !== void 0 && model.description === en[key] ? t(key) : model.description;
		}
		/** Flatten the directory into popup rows; failure rows are listed for visibility but never selectable. */
		function optionsOf(directory, t) {
			const rows = [];
			const arrangement = arrangementStore.get();
			// rc2 port: manufacturer-first rows — same model across providers
			// merges into one canonical label carrying the provider suffix.
			for (const group of arrangeCatalog(offeringsOf(directory.groups), arrangement, t("group.all"))) {
				for (const entry of group.models) {
					for (const offering of entry.offerings) {
						rows.push({
							id: rowId(offering.provider, offering.model.id),
							label: modelWithProvider(entry.name, offering.providerName),
							detail: arrangement === "manufacturer" ? `${group.manufacturer} · ${offering.providerName}` : offering.providerName,
							...directory.current !== null && offeringSelected(directory.current, offering) ? { active: true } : {}
						});
					}
				}
			}
			for (const failure of directory.failures) rows.push({
				id: `failure/${failure.id}`,
				label: failure.id === "deepseek-account" ? t("provider.account") : failure.name,
				detail: t("option.loadError", { message: failure.message })
			});
			return rows;
		}
		/**
		* Resolve a picked row back to its model selection by matching against the loaded
		* groups (the same data the rows were built from — ids stay opaque).
		* @param state - the session's directory snapshot.
		* @param id - the picked row id.
		* @returns the row's model selection, or undefined for failure rows / stale ids.
		*/
		function selectionOf(state, id) {
			for (const group of state.groups) for (const model of group.models) {
				if (rowId(group.id, model.id) !== id) continue;
				const reasoningEffort = state.current?.provider === group.id && state.current.model === model.id ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort : model.reasoning?.defaultEffort;
				return {
					provider: group.id,
					model: model.id,
					...reasoningEffort === void 0 ? {} : { reasoningEffort }
				};
			}
		}
		/** Dictionary namespace owned by this plugin. */
		const NS = "model";
		/** Required services: the contribution registry, the seat's slot registry, locale, and the service's own faces. */
		const inject = [
			"commandUi",
			"locale",
			"sessions",
			"slots",
			"remote",
			"remote.session",
			"configForms"
		];
		/**
		* Client plugin body: mount ModelDirectoryResolver, register the `model` dictionaries,
		* then register the /model popup contribution and the composer model seat
		* over the service.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-model-selection: dictionaries");
			const t = ctx.locale.bind(NS);
			// Settings form bridge: mirror the entry's committed `arrangement` value
			// into the module store so both selection surfaces regroup live. The form
			// exists only when the host half exposes a Config; on older hosts the
			// lookup is skipped and the default arrangement stands.
			clientCtxRef = ctx;
			ctx.effect(() => {
				let unsubscribe = null;
				const sync = () => {
					const form = configFormRef;
					if (form === null) return;
					const snapshot = form.getSnapshot();
					if (snapshot.status === "ready" && snapshot.value !== undefined) {
						const value = snapshot.value.arrangement;
						if (typeof value === "string") arrangementStore.set(value);
						if (Array.isArray(snapshot.value.order)) orderStore.set(snapshot.value.order);
						if (Array.isArray(snapshot.value.groupOrder)) groupOrderStore.set(snapshot.value.groupOrder);
					}
				};
				const attach = () => {
					const form = configFormGet();
					if (form === null) return false;
					sync();
					unsubscribe = form.subscribe(sync);
					return true;
				};
				if (attach()) return () => unsubscribe();
				// The form can register after client apply resolves — poll briefly
				// until it exists so the bridge still wires up on slower boots.
				const timer = setInterval(() => {
					if (attach()) clearInterval(timer);
				}, 400);
				return () => {
					clearInterval(timer);
					if (unsubscribe !== null) unsubscribe();
				};
			}, "ui-model-selection: arrangement bridge");
			injectArrangeCss();
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "model-selection",
				order: 40,
				label: () => t("settings.nav"),
				locale: NS
			}, ModelSelectionSection));
			ctx.plugin(ModelDirectoryResolver);
			ctx.inject(["commandUi", "modelDirectories"], (scope) => {
				const command = scope.get("commandUi");
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.effect(() => command.register({
					name: "model",
					label: () => t("command.label"),
					description: () => t("command.description"),
					icon: _deepseek_ai_dsh_client_ui_primitives.IconDataOutlineRegular,
					available: (session) => sessions.subagentAddress(session.sessionId) === void 0,
					ui: {
						kind: "popupSelect",
						options: async (session) => {
							if (sessions.subagentAddress(session.sessionId) !== void 0) throw new Error("model selection is unavailable for addressed subagent sessions");
							return optionsOf(await models.directoryFor(session.sessionId).load(), t);
						},
						onSelect: async (option, session) => {
							if (sessions.subagentAddress(session.sessionId) !== void 0) throw new Error("model selection is unavailable for addressed subagent sessions");
							const directory = models.directoryFor(session.sessionId);
							const selection = selectionOf(directory.store.getSnapshot(), option.id);
							if (selection === void 0) throw new Error("this provider's catalog failed to load — pick a model from a loaded group");
							const result = await directory.select(selection);
							if (!result.ok) {
								if (result.error.code === "session/writer-held") throw new Error(t("error.sessionInUse"));
								throw result.error;
							}
						}
					}
				}), "ui-model-selection: /model contribution");
			});
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					locale: NS,
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const available = sessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							directory: directory.store,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => available ? directory.select(selection) : Promise.resolve(void 0)
						};
					}
				}, ModelSelect));
			});
		}
		//#endregion
		exports.ModelDirectory = ModelDirectory;
		exports.ModelDirectoryResolver = ModelDirectoryResolver;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map