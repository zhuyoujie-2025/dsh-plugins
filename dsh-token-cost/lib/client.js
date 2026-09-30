window.__ModuleLoader__.load({
	id: "dsh-token-cost",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/cost.js
		const PRICING = {
			// 裸 deepseek-v4-pro / deepseek-v4-flash 与下方 SCNet 段重复（JS 后写覆盖，
			// 实际生效的一直是 SCNet 平价）——保留后者，消除重复键。
			"deepseek-v4-pro-0813": { offPeak: { cacheHit: .9, miss: 9, output: 27 }, peak: { cacheHit: .9, miss: 9, output: 27 } },
			"deepseek-v4-flash-0731": { offPeak: { cacheHit: .3, miss: 3, output: 9 }, peak: { cacheHit: .3, miss: 3, output: 9 } },
			"deepseek-v4-flash": { offPeak: { cacheHit: .2, miss: 1, output: 2 }, peak: { cacheHit: .2, miss: 1, output: 2 } },
			"deepseek-v4-pro": { offPeak: { cacheHit: 1, miss: 12, output: 24 }, peak: { cacheHit: 1, miss: 12, output: 24 } },
			"glm-5.3": { offPeak: { cacheHit: 2, miss: 8, output: 28 }, peak: { cacheHit: 2, miss: 8, output: 28 } },
			"glm-5.2": { offPeak: { cacheHit: 2, miss: 8, output: 28 }, peak: { cacheHit: 2, miss: 8, output: 28 } },
			"glm-5.1": { offPeak: { cacheHit: 2, miss: 8, output: 28 }, peak: { cacheHit: 2, miss: 8, output: 28 } },
			"glm-5": { offPeak: { cacheHit: 1.5, miss: 6, output: 22 }, peak: { cacheHit: 1.5, miss: 6, output: 22 } },
			"glm-5.2-base": { offPeak: { cacheHit: 1, miss: 4, output: 14 }, peak: { cacheHit: 1, miss: 4, output: 14 } },
			"glm-5.1-base": { offPeak: { cacheHit: 1, miss: 4, output: 14 }, peak: { cacheHit: 1, miss: 4, output: 14 } },
			"glm-5-base": { offPeak: { cacheHit: .75, miss: 3, output: 11 }, peak: { cacheHit: .75, miss: 3, output: 11 } },
			"kimi-k3": { offPeak: { cacheHit: 2, miss: 20, output: 100 }, peak: { cacheHit: 2, miss: 20, output: 100 } },
			"kimi-k2.7-code": { offPeak: { cacheHit: 1.3, miss: 6.5, output: 27 }, peak: { cacheHit: 1.3, miss: 6.5, output: 27 } },
			"kimi-k2.6": { offPeak: { cacheHit: 1.3, miss: 6.5, output: 27 }, peak: { cacheHit: 1.3, miss: 6.5, output: 27 } },
			"kimi-k2.5": { offPeak: { cacheHit: .7, miss: 4, output: 21 }, peak: { cacheHit: .7, miss: 4, output: 21 } },
			"kimi-k2.7-base": { offPeak: { cacheHit: .65, miss: 3.25, output: 13.5 }, peak: { cacheHit: .65, miss: 3.25, output: 13.5 } },
			"qwen3.8-max": { offPeak: { cacheHit: 1.5, miss: 12, output: 36 }, peak: { cacheHit: 1.5, miss: 12, output: 36 } },
			"qwen3.7-max": { offPeak: { cacheHit: 2.4, miss: 12, output: 36 }, peak: { cacheHit: 2.4, miss: 12, output: 36 } },
			"qwen3.7-plus": { offPeak: { cacheHit: 1.2, miss: 6, output: 24 }, peak: { cacheHit: 1.2, miss: 6, output: 24 } },
			"qwen3.6-max": { offPeak: { cacheHit: 15, miss: 15, output: 90 }, peak: { cacheHit: 15, miss: 15, output: 90 } },
			"qwen3.6-plus": { offPeak: { cacheHit: 8, miss: 8, output: 48 }, peak: { cacheHit: 8, miss: 8, output: 48 } },
			"qwen3.6-flash": { offPeak: { cacheHit: 4.8, miss: 4.8, output: 28.8 }, peak: { cacheHit: 4.8, miss: 4.8, output: 28.8 } },
			"qwen3.5-122b-a10b": { offPeak: { cacheHit: .8, miss: .8, output: 6.4 }, peak: { cacheHit: .8, miss: .8, output: 6.4 } },
			"qwen3.6-27b": { offPeak: { cacheHit: 3, miss: 3, output: 18 }, peak: { cacheHit: 3, miss: 3, output: 18 } },
			"qwen3-235b-a22b": { offPeak: { cacheHit: null, miss: 1, output: 4 }, peak: { cacheHit: null, miss: 1, output: 4 } },
			"qwen3-30b-a3b": { offPeak: { cacheHit: null, miss: .375, output: 1.5 }, peak: { cacheHit: null, miss: .375, output: 1.5 } },
			"minimax-m3": { offPeak: { cacheHit: .84, miss: 4.2, output: 16.8 }, peak: { cacheHit: .84, miss: 4.2, output: 16.8 } },
			"minimax-m2.7": { offPeak: { cacheHit: .42, miss: 2.1, output: 8.4 }, peak: { cacheHit: .42, miss: 2.1, output: 8.4 } },
			"minimax-m2.5": { offPeak: { cacheHit: .21, miss: 2.1, output: 8.4 }, peak: { cacheHit: .21, miss: 2.1, output: 8.4 } },
			"mimo-v2.5-pro": { offPeak: { cacheHit: 1.4, miss: 7, output: 21 }, peak: { cacheHit: 1.4, miss: 7, output: 21 } }
		};
		const DEFAULT_MODEL = "deepseek-v4-pro";
		function isPeakHour(now = Date.now()) {
			const h = new Date(now + 8 * 36e5).getUTCHours();
			return h >= 9 && h < 12 || h >= 14 && h < 18;
		}
		function num(v) {
			return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
		}
		// 精确匹配 → 「模型 id 以表内 key 为前缀」最长者（deepseek-v4-flash-vision-exp
		// → deepseek-v4-flash）→ 回退默认档。未知模型按 deepseek-v4-pro 估（文档化兜底）。
		function tierOf(modelId) {
			const id = String(modelId ?? "").toLowerCase();
			const key = PRICING[id] !== void 0 ? id : Object.keys(PRICING).filter((k) => id.startsWith(k)).sort((a, b) => b.length - a.length)[0] ?? DEFAULT_MODEL;
			const model = PRICING[key] ?? PRICING[DEFAULT_MODEL];
			const tier = isPeakHour() ? model.peak : model.offPeak;
			return { miss: num(tier.miss), cacheHit: num(tier.cacheHit), output: num(tier.output) };
		}
		function estimateCost(usage, modelId) {
			if (usage === void 0 || usage === null) return 0;
			const tier = tierOf(modelId);
			const uncached = (num(usage.uncachedInputTokens) + num(usage.cacheWriteTokens)) / 1e6;
			const cached = num(usage.cacheReadTokens) / 1e6;
			const output = num(usage.outputTokens) / 1e6;
			return uncached * tier.miss + cached * tier.cacheHit + output * tier.output;
		}
		function formatCost(yuan) {
			if (!(yuan > 0)) return "¥0";
			if (yuan < .01) return "¥" + yuan.toFixed(4);
			return "¥" + yuan.toFixed(2);
		}
//#endregion
		//#region src/client/index.js
		/**
		* dsh-token-cost — client half（浏览器半）。
		*
		* 在对话输入区上方（`conversation.composer.dock`，与框架自带的 StatsLine
		* 统计行并列）注册一行「预估费用」：读取 session projection `tokenUsage`
		* （本次对话累计 token，框架 token-meter 提供），按 DeepSeek 峰谷定价估算
		* 人民币费用，实时随对话更新。纯展示，不写会话日志、不污染模型输入。
		*/
		const inject = ["slots", "locale"];
		const ID = "dsh-token-cost";
		const ZH = {
			cost: "预估费用",
			peak: "高峰"
		};
		const EN = {
			cost: "Est. cost",
			peak: "peak"
		};
		const CSS = [
			".tcost-line { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; line-height: 1; white-space: nowrap; }",
			".tcost-label { opacity: .72; }",
			".tcost-value { font-variant-numeric: tabular-nums; font-weight: 600; }",
			".tcost-peak { opacity: .6; font-size: 11px; }"
		].join("\n");
		function injectStyle() {
			const tagId = "dsh-token-cost/cost.css";
			if (document.querySelector("style[data-plugin-css=\"dsh-token-cost/cost.css\"]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = ID;
				tag.dataset.pluginCss = tagId;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
		}
		/** 费用行组件：读 tokenUsage projection，展示预估费用（无数据时返回 null）。 */
		function CostLine({ useProjection, t }) {
			const usage = useProjection("tokenUsage");
			const selection = useProjection("modelSelection");
			if (usage === void 0 || usage === null) return null;
			// pending/next 优先于 lastUsed（形状见 modelSelectionProjectionSchema）。
			const modelId = selection?.next?.model ?? selection?.pending?.model ?? selection?.lastUsed?.model;
			const cost = estimateCost(usage, modelId);
			if (!(cost > 0)) return null;
			return (0, react.createElement)("div", { className: "tcost-line" }, (0, react.createElement)("span", { className: "tcost-label" }, t("cost")), (0, react.createElement)("span", { className: "tcost-value" }, formatCost(cost)), isPeakHour() ? (0, react.createElement)("span", { className: "tcost-peak" }, "· " + t("peak")) : null);
		}
		function apply(ctx) {
			injectStyle();
			try {
				ctx.locale.register(ID, "zh", ZH);
				ctx.locale.register(ID, "en", EN);
			} catch (error) {
				console.error("dsh-token-cost: locale registration failed: " + String(error));
			}
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "token-cost",
				order: 1,
				locale: ID
			}, CostLine));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map