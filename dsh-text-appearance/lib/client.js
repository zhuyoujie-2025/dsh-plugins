window.__ModuleLoader__.load({
	id: "dsh-text-appearance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-store");
		//#region src/client/store.js
		/**
		* 文字外观 slot store：镜像思考/正文的 HSL（色相/饱和度/明度）+ 字号 + 字体。
		* 三个颜色维度由滑块直接写入（连续，不跳变）；颜色写穿到 theme service。
		*/
		/** 声明文字外观行的状态与写入口。 */
		function createTextAppearanceStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					thinkingHue: 0,
					thinkingSaturation: 100,
					thinkingLightness: 50,
					thinkingSize: "",
					thinkingFont: "",
					bodyHue: 0,
					bodySaturation: 0,
					bodyLightness: 50,
					bodySize: "",
					bodyFont: "",
					revision: -1
				}),
				actions: {
					/**
					* 全量 sync：含 HSL。仅用于初始化（store.revision === -1）与用户从 UI 清空
					* 颜色（sync 时 snapshot.thinkingColor === '' 触发 reset echo）。
					*/
					sync: (d, thinkingHue, thinkingSaturation, thinkingLightness, thinkingSize, thinkingFont, bodyHue, bodySaturation, bodyLightness, bodySize, bodyFont, revision) => {
						if (revision <= d.revision) return;
						d.thinkingHue = thinkingHue;
						d.thinkingSaturation = thinkingSaturation;
						d.thinkingLightness = thinkingLightness;
						d.thinkingSize = thinkingSize;
						d.thinkingFont = thinkingFont;
						d.bodyHue = bodyHue;
						d.bodySaturation = bodySaturation;
						d.bodyLightness = bodyLightness;
						d.bodySize = bodySize;
						d.bodyFont = bodyFont;
						d.revision = revision;
					},
					/**
					* Metadata-only sync：只覆盖 font/size/revision，不动 HSL。
					*
					* 用于 server 串行 ack 触发的 theme/change 回调——此时 HSL 已经由 setThinkingHsl
					* / setBodyHsl 在用户拖动时立即写入本地 store，再用 cssToHsl(round-trip) 覆盖
					* 会把 server FIFO 处理中间值回写，产生"跳过去跳回去"。
					*/
					syncMetadata: (d, thinkingSize, thinkingFont, bodySize, bodyFont, revision) => {
						if (revision <= d.revision) return;
						d.thinkingSize = thinkingSize;
						d.thinkingFont = thinkingFont;
						d.bodySize = bodySize;
						d.bodyFont = bodyFont;
						d.revision = revision;
					},
					setThinkingHsl: (d, hue, saturation, lightness) => {
						d.thinkingHue = hue;
						d.thinkingSaturation = saturation;
						d.thinkingLightness = lightness;
					},
					setBodyHsl: (d, hue, saturation, lightness) => {
						d.bodyHue = hue;
						d.bodySaturation = saturation;
						d.bodyLightness = lightness;
					},
					setFonts: (d, thinkingFont, bodyFont) => {
						d.thinkingFont = thinkingFont;
						d.bodyFont = bodyFont;
					}
				}
			});
		}
		/**
		* 同步元数据（font / size / revision）但保留本地 HSL 不动。
		*
		* 用途：theme/change 事件回调（server 串行 ack 触发的同步）只会覆盖 font/size
		* 和 revision；HSL 由 setThinkingHsl / setBodyHsl 独占控制。
		* 避免 server FIFO 串行 ack 把中间旧值回写到 UI 造成"跳过去跳回去"。
		*
		* 全量 sync（init 用一次）见原 `sync` action。
		*/
		//#endregion
		//#region src/client/color.js
		/**
		* 颜色工具：完整 HSL 模型（色相 hue + 饱和度 saturation + 明度 lightness）。
		* - 色相条选颜色（红橙黄绿青蓝紫连续）
		* - 饱和度条选灰 ↔ 纯色（0% 灰、100% 纯色）
		* - 明度条选深浅（0% 黑、50% 纯色、100% 白）
		* 三条组合覆盖黑/白/灰 + 彩色 + 深浅；所有转换连续，无离散跳变。
		*/
		/** 色相条背景渐变：永远纯色彩虹（红橙黄绿青蓝紫），一眼看到所有颜色。 */
		function hueGradient() {
			return "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))";
		}
		/** 饱和度条背景渐变（灰 → 纯色，按当前色相/明度）。 */
		function saturationGradient(hue, lightness) {
			const h = clampHueForCss(hue);
			const l = clamp(lightness);
			return `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`;
		}
		/** 明度条背景渐变（黑 → 纯色 → 白，按当前色相/饱和度）。 */
		function lightnessGradient(hue, saturation) {
			const h = clampHueForCss(hue);
			const s = clamp(saturation);
			return `linear-gradient(to right, hsl(${h},${s}%,0%), hsl(${h},${s}%,50%), hsl(${h},${s}%,100%))`;
		}
		/**
		* hue + saturation + lightness → CSS 颜色。
		*
		* CSS 的 hsl() 接受任意实数 hue（360 与 0 等价，720 与 0 等价）；
		* 我们不在生成侧做归一化——保留用户拖到的精确 hue（包括 360），
		* 解析侧 cssToHsl 会自己 round 到 [0,360) 整数。
		*/
		function hslToCss(hue, saturation, lightness) {
			return `hsl(${roundHue(hue)}, ${clamp(saturation)}%, ${clamp(lightness)}%)`;
		}
		/** CSS 颜色 → { hue, saturation, lightness }，解析失败回退默认灰。 */
		function cssToHsl(color) {
			const rgb = parseRgb(color);
			if (rgb === null) return {
				hue: 0,
				saturation: 0,
				lightness: 50
			};
			return rgbToHsl(rgb[0], rgb[1], rgb[2]);
		}
		/** 生成 CSS 时只要"非负整数"，不强制归一化到 [0,360)——避免 hue=360 被写成 0 导致 thumb 跳到最左。 */
		function roundHue(hue) {
			return Math.max(0, Math.round(hue));
		}
		function clampHueForCss(hue) {
			return Math.max(0, Math.round(hue));
		}
		function clamp(v) {
			return Math.max(0, Math.min(100, Math.round(v)));
		}
		function rgbToHsl(r, g, b) {
			const rn = r / 255;
			const gn = g / 255;
			const bn = b / 255;
			const max = Math.max(rn, gn, bn);
			const min = Math.min(rn, gn, bn);
			const l = (max + min) / 2;
			const d = max - min;
			let h = 0;
			let s = 0;
			if (d !== 0) {
				s = d / (1 - Math.abs(2 * l - 1));
				if (max === rn) h = (gn - bn) / d % 6;
				else if (max === gn) h = (bn - rn) / d + 2;
				else h = (rn - gn) / d + 4;
				h *= 60;
				if (h < 0) h += 360;
			}
			return {
				hue: Math.round(h),
				saturation: Math.round(s * 100),
				lightness: Math.round(l * 100)
			};
		}
		/** 解析 #rrggbb / rgb() / hsl() 为 RGB 三元组（0-255），失败返回 null。 */
		function parseRgb(color) {
			if (typeof color !== "string") return null;
			const c = color.trim();
			const hex = /^#?([0-9a-f]{6})$/i.exec(c);
			if (hex) return [
				parseInt(hex[1].slice(0, 2), 16),
				parseInt(hex[1].slice(2, 4), 16),
				parseInt(hex[1].slice(4, 6), 16)
			];
			const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
			if (rgb) return [
				+rgb[1],
				+rgb[2],
				+rgb[3]
			];
			const hsl = /hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%/i.exec(c);
			if (hsl) return hslToRgb(+hsl[1], +hsl[2] / 100, +hsl[3] / 100);
			return null;
		}
		function hslToRgb(h, s, l) {
			const hue = (h % 360 + 360) % 360 / 360;
			const q = l < .5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;
			const f = (t) => {
				let v = t;
				if (v < 0) v += 1;
				if (v > 1) v -= 1;
				if (v < 1 / 6) return p + (q - p) * 6 * v;
				if (v < 1 / 2) return q;
				if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
				return p;
			};
			return [
				Math.round(f(hue + 1 / 3) * 255),
				Math.round(f(hue) * 255),
				Math.round(f(hue - 1 / 3) * 255)
			];
		}
		//#endregion
		//#region src/client/index.js
		/**
		* dsh-text-appearance — client half（浏览器半）。
		*
		* 在「设置 → 通用」里注册一行「文字外观」，分别调节思考内容 / 正文的：
		*   - 颜色（色相条）、饱和度（灰↔纯色条）、深浅（黑↔白条）——三条覆盖黑/白/灰 + 彩色 + 深浅
		*   - 字体、大小（字号）
		*
		* 三条滑块直接读写 store 的 HSL 数值（连续不跳变），颜色写穿到 theme 服务；
		* 字体与正文颜色/字号通过 CSS 覆盖自包含。
		*/
		const inject = [
			"slots",
			"locale"
		];
		const ID = "dsh-text-appearance";
		const THINKING_FONT_TOKEN = "--dsh-thinking-font-family";
		const BODY_FONT_TOKEN = "--dsh-body-font-family";
		const THINKING_FONT_KEY = "dsh:thinking-font";
		const BODY_FONT_KEY = "dsh:body-font";
		const THINKING_COLOR_VAR = "--dsh-thinking-color";
		const THINKING_SIZE_VAR = "--dsh-thinking-size";
		const BODY_COLOR_VAR = "--dsh-body-color";
		const BODY_SIZE_VAR = "--dsh-body-size";
		const THINKING_COLOR_KEY = "dsh:thinking-color";
		const THINKING_SIZE_KEY = "dsh:thinking-size";
		const BODY_COLOR_KEY = "dsh:body-color";
		const BODY_SIZE_KEY = "dsh:body-size";
		/** 默认思考色 #d4af37（金色）对应的精确 HSL（与系统 gold 调色板一致）。 */
		const DEFAULT_THINKING_HSL = {
			hue: 46,
			saturation: 65,
			lightness: 52
		};
		const DEFAULT_BODY_HSL = {
			hue: 0,
			saturation: 0,
			lightness: 50
		};
		const DEFAULT_THINKING_SIZE = 14;
		const DEFAULT_BODY_SIZE = 16;
		const MIN_SIZE = 12;
		const MAX_SIZE = 28;
		const FONT_OPTIONS = [
			{
				value: "",
				label: "默认"
			},
			{
				value: "system-ui, sans-serif",
				label: "系统默认"
			},
			{
				value: "'Microsoft YaHei', 'PingFang SC', sans-serif",
				label: "微软雅黑 / 苹方"
			},
			{
				value: "'SimSun', serif",
				label: "宋体"
			},
			{
				value: "'SimHei', sans-serif",
				label: "黑体"
			},
			{
				value: "'KaiTi', serif",
				label: "楷体"
			},
			{
				value: "'Georgia', serif",
				label: "Georgia（衬线）"
			},
			{
				value: "'Consolas', monospace",
				label: "Consolas（等宽）"
			}
		];
		const ZH = {
			title: "文字外观",
			thinking: "思考内容",
			body: "正文输出",
			color: "颜色",
			saturation: "灰↔纯",
			lightness: "深浅",
			font: "字体",
			size: "大小"
		};
		const EN = {
			title: "Text appearance",
			thinking: "Thinking",
			body: "Body",
			color: "Color",
			saturation: "Sat",
			lightness: "Shade",
			font: "Font",
			size: "Size"
		};
		const CSS = [
			".ta-group { display: flex; flex-direction: column; gap: 12px; }",
			".ta-title { font-size: 13px; font-weight: 600; }",
			".ta-field { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border: 1px solid rgba(127,127,137,.2); border-radius: 8px; }",
			".ta-fieldLabel { font-size: 13px; font-weight: 600; }",
			".ta-row { display: flex; align-items: center; gap: 10px; }",
			".ta-label { flex: none; min-width: 38px; font-size: 12px; opacity: .72; }",
			".ta-swatch { flex: none; width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(127,127,137,.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }",
			".ta-track { position: relative; flex: 1 1 auto; height: 16px; border-radius: 999px; cursor: pointer; touch-action: none; }",
			".ta-thumb { position: absolute; top: 50%; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.4); transform: translate(-50%, -50%); background: transparent; pointer-events: none; }",
			".ta-select { flex: 1 1 auto; min-width: 0; height: 26px; border-radius: 6px; border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit; font-size: 12px; padding: 0 6px; }",
			".ta-range { flex: 1 1 auto; min-width: 0; }",
			".ta-value { flex: none; min-width: 40px; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; opacity: .8; }",
			"[data-variant=\"think\"] { color: var(--dsh-thinking-color, inherit) !important; font-size: var(--dsh-thinking-size, inherit) !important; font-family: var(--dsh-thinking-font-family, inherit) !important; }",
			"[class*=\"_markdown\"] { color: var(--dsh-body-color, inherit) !important; font-size: var(--dsh-body-size, inherit) !important; font-family: var(--dsh-body-font-family, inherit) !important; }"
		].join("\n");
		function injectStyle() {
			const tagId = "dsh-text-appearance/appearance.css";
			if (document.querySelector("style[data-plugin-css=\"dsh-text-appearance/appearance.css\"]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = ID;
				tag.dataset.pluginCss = tagId;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
		}
		function readStored(key) {
			try {
				return localStorage.getItem(key) ?? "";
			} catch {
				return "";
			}
		}
		function writeStored(key, value) {
			try {
				if (value === "") localStorage.removeItem(key);
				else localStorage.setItem(key, value);
			} catch {}
		}
		function applyFontToDom(token, value) {
			document.documentElement.style.setProperty(token, value === "" ? "inherit" : value);
		}
		/** 通用滑块：background 渐变、value/max 定位、拖动连续回调 onChange(0..max)。 */
		function Slider({ background, value, max = 100, onChange }) {
			const trackRef = (0, react.useRef)(null);
			const handleDown = (e) => {
				e.preventDefault();
				const rect = trackRef.current.getBoundingClientRect();
				const commit = (clientX) => {
					const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
					onChange(Math.round(ratio * max));
				};
				commit(e.clientX);
				const onMove = (ev) => commit(ev.clientX);
				const onUp = () => {
					window.removeEventListener("mousemove", onMove);
					window.removeEventListener("mouseup", onUp);
				};
				window.addEventListener("mousemove", onMove);
				window.addEventListener("mouseup", onUp);
			};
			return (0, react.createElement)("div", {
				className: "ta-track",
				ref: trackRef,
				onMouseDown: handleDown,
				style: { background }
			}, (0, react.createElement)("div", {
				className: "ta-thumb",
				style: { left: value / max * 100 + "%" }
			}));
		}
		/** 单个外观字段：三条颜色滑块 + 字体下拉 + 字号滑块，均带标签说明。 */
		function Field({ t, label, font, onFont, hue, saturation, lightness, onHsl, size, onSize, defaultSize }) {
			const sizeNum = parseInt(size || "", 10);
			const sizeValue = Number.isFinite(sizeNum) ? sizeNum : defaultSize;
			const swatchColor = hslToCss(hue, saturation, lightness);
			return (0, react.createElement)("div", { className: "ta-field" }, (0, react.createElement)("div", { className: "ta-fieldLabel" }, label), (0, react.createElement)("div", { className: "ta-row" }, (0, react.createElement)("div", {
				className: "ta-swatch",
				style: { background: swatchColor }
			}), (0, react.createElement)("span", { className: "ta-label" }, t("color")), (0, react.createElement)(Slider, {
				background: hueGradient(),
				value: hue,
				max: 360,
				onChange: (h) => onHsl(h, saturation === 0 ? 100 : saturation, lightness)
			})), (0, react.createElement)("div", { className: "ta-row" }, (0, react.createElement)("span", { className: "ta-label" }, t("saturation")), (0, react.createElement)(Slider, {
				background: saturationGradient(hue, lightness),
				value: saturation,
				onChange: (s) => onHsl(hue, s, lightness)
			})), (0, react.createElement)("div", { className: "ta-row" }, (0, react.createElement)("span", { className: "ta-label" }, t("lightness")), (0, react.createElement)(Slider, {
				background: lightnessGradient(hue, saturation),
				value: lightness,
				onChange: (l) => onHsl(hue, saturation, l)
			})), (0, react.createElement)("div", { className: "ta-row" }, (0, react.createElement)("span", { className: "ta-label" }, t("font")), (0, react.createElement)("select", {
				className: "ta-select",
				value: font || "",
				onChange: (e) => onFont(e.target.value)
			}, FONT_OPTIONS.map((o) => (0, react.createElement)("option", {
				key: o.value || "default",
				value: o.value
			}, o.label)))), (0, react.createElement)("div", { className: "ta-row" }, (0, react.createElement)("span", { className: "ta-label" }, t("size")), (0, react.createElement)("input", {
				type: "range",
				className: "ta-range",
				min: MIN_SIZE,
				max: MAX_SIZE,
				step: 1,
				value: sizeValue,
				onChange: (e) => onSize(e.target.value + "px")
			}), (0, react.createElement)("span", { className: "ta-value" }, sizeValue + "px")));
		}
		function TextAppearanceRow(props) {
			const { t, useStore, setThinkingHsl, setThinkingSize, setThinkingFont, setBodyHsl, setBodySize, setBodyFont } = props;
			const s = useStore((st) => st);
			return (0, react.createElement)("div", { className: "ta-group" }, (0, react.createElement)("div", { className: "ta-title" }, t("title")), (0, react.createElement)(Field, {
				t,
				label: t("thinking"),
				font: s.thinkingFont,
				onFont: setThinkingFont,
				hue: s.thinkingHue,
				saturation: s.thinkingSaturation,
				lightness: s.thinkingLightness,
				onHsl: setThinkingHsl,
				size: s.thinkingSize,
				onSize: setThinkingSize,
				defaultSize: DEFAULT_THINKING_SIZE
			}), (0, react.createElement)(Field, {
				t,
				label: t("body"),
				font: s.bodyFont,
				onFont: setBodyFont,
				hue: s.bodyHue,
				saturation: s.bodySaturation,
				lightness: s.bodyLightness,
				onHsl: setBodyHsl,
				size: s.bodySize,
				onSize: setBodySize,
				defaultSize: DEFAULT_BODY_SIZE
			}));
		}
		function apply(ctx) {
			injectStyle();
			try {
				ctx.locale.register(ID, "zh", ZH);
				ctx.locale.register(ID, "en", EN);
			} catch (error) {
				console.error("dsh-text-appearance: locale registration failed: " + String(error));
			}
			// 0.1.7 的 theme 服务只剩 getTheme/overrideTokens——旧的
			// setThinkingColor/setThinkingSize/setBodyColor/setBodySize 及快照字段
			// 都不存在。改为自包含：值持久化在 localStorage，经 CSS 变量写穿到
			// 覆盖层（[data-variant="think"] / [class*="_markdown"] 消费），
			// 不依赖 theme 快照；store.revision 用本地单调计数。
			const store = createTextAppearanceStore();
			let bound;
			let localRev = 0;
			const readHsl = (key) => {
				try {
					const v = JSON.parse(localStorage.getItem(key) || "null");
					if (v && Number.isFinite(v.hue) && Number.isFinite(v.saturation) && Number.isFinite(v.lightness)) return v;
				} catch { }
				return null;
			};
			const writeHsl = (key, v) => {
				try {
					localStorage.setItem(key, JSON.stringify(v));
				} catch { }
			};
			const setVar = (token, value) => {
				try {
					if (value === "") document.documentElement.style.removeProperty(token);
					else document.documentElement.style.setProperty(token, value);
				} catch { }
			};
			applyFontToDom(THINKING_FONT_TOKEN, readStored(THINKING_FONT_KEY));
			applyFontToDom(BODY_FONT_TOKEN, readStored(BODY_FONT_KEY));
			/**
			* 把 localStorage 的外观值投影到 CSS 变量，并把滑块位置同步给设置行
			* store。未设置的颜色/字号不写变量（应用默认皮肤），滑块显示默认值。
			*/
			const applyStored = () => {
				const th = readHsl(THINKING_COLOR_KEY);
				const bd = readHsl(BODY_COLOR_KEY);
				const tSize = readStored(THINKING_SIZE_KEY);
				const bSize = readStored(BODY_SIZE_KEY);
				setVar(THINKING_COLOR_VAR, th ? hslToCss(th.hue, th.saturation, th.lightness) : "");
				setVar(THINKING_SIZE_VAR, tSize === "" ? "" : tSize + "px");
				setVar(BODY_COLOR_VAR, bd ? hslToCss(bd.hue, bd.saturation, bd.lightness) : "");
				setVar(BODY_SIZE_VAR, bSize === "" ? "" : bSize + "px");
				const thD = th ?? DEFAULT_THINKING_HSL;
				const bdD = bd ?? DEFAULT_BODY_HSL;
				bound?.sync(thD.hue, thD.saturation, thD.lightness, tSize, readStored(THINKING_FONT_KEY), bdD.hue, bdD.saturation, bdD.lightness, bSize, readStored(BODY_FONT_KEY), ++localRev);
			};
			applyStored();
			const setFont = (token, key) => (value) => {
				writeStored(key, value);
				applyFontToDom(token, value);
				bound?.setFonts(readStored(THINKING_FONT_KEY), readStored(BODY_FONT_KEY));
			};
			/** 写 HSL：本地 store + CSS 变量 + localStorage（自包含，不经 theme 服务）。 */
			const setHsl = (varToken, storeKey, storeSetter) => (hue, saturation, lightness) => {
				bound?.[storeSetter](hue, saturation, lightness);
				setVar(varToken, hslToCss(hue, saturation, lightness));
				writeHsl(storeKey, {
					hue,
					saturation,
					lightness
				});
			};
			const setSize = (varToken, storeKey) => (s) => {
				const str = String(s ?? "");
				writeStored(storeKey, str);
				setVar(varToken, str === "" ? "" : str + "px");
			};
			const injected = (actions) => {
				bound = actions;
				applyStored();
				return {
					setThinkingHsl: setHsl(THINKING_COLOR_VAR, THINKING_COLOR_KEY, "setThinkingHsl"),
					setThinkingSize: setSize(THINKING_SIZE_VAR, THINKING_SIZE_KEY),
					setThinkingFont: setFont(THINKING_FONT_TOKEN, THINKING_FONT_KEY),
					setBodyHsl: setHsl(BODY_COLOR_VAR, BODY_COLOR_KEY, "setBodyHsl"),
					setBodySize: setSize(BODY_SIZE_VAR, BODY_SIZE_KEY),
					setBodyFont: setFont(BODY_FONT_TOKEN, BODY_FONT_KEY)
				};
			};
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "text-appearance",
				order: 12,
				store,
				locale: ID,
				inject: injected
			}, TextAppearanceRow));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map