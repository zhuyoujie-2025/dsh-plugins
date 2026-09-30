window.__ModuleLoader__.load({
	id: "dsh-welcome-typewriter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/index.js
		/**
		* dsh-welcome-typewriter — client half（浏览器半，自包含零依赖）。
		* 隐藏 hero 标题「探索未至之境」，原位插入 .dsh-welcome-anchor
		* 按 90ms/字打字。80% 常规 / 15% 金色稀有 / 5% 彩虹传说；
		* 生命周期收进 ctx.effect。
		*/
		const name = "dsh-welcome-typewriter-client";
		const inject = [];
		const STYLE_ID = "dsh-welcome-typewriter-style";
		const CSS = [
			".dsh-welcome { display: inline-block; white-space: nowrap; vertical-align: bottom; margin-right: 10px; color: var(--dsw-alias-label-primary); font-size: 26px; font-weight: 500; line-height: 32px; }",
			".dsh-welcome-caret { display: inline-block; vertical-align: -.08em; background: currentColor; border-radius: 1px; width: 2px; height: .95em; margin-left: 2px; animation: dsh-caret-blink 1.1s steps(2,start) infinite; }",
			".dsh-welcome-rare .dsh-welcome-caret { background: #e0a63e; }",
			".dsh-welcome-legendary .dsh-welcome-caret { background: #b197fc; animation: none; }",
			"@keyframes dsh-caret-blink { to { visibility: hidden } }",
			".dsh-welcome-rare { background: linear-gradient(100deg,#f5d97e 0%,#e0a63e 55%,#f9e8b3 100%); color: #0000 !important; -webkit-background-clip: text; background-clip: text; }",
			".dsh-welcome-legendary { background: linear-gradient(90deg,#ff6b6b,#ffa94d,#ffd43b,#69db7c,#4dabf7,#b197fc,#ff6b6b) 0 0/200%; color: #0000 !important; -webkit-background-clip: text; background-clip: text; animation: dsh-welcome-rainbow 6s linear infinite; }",
			"@keyframes dsh-welcome-rainbow { to { background-position: 200% } }",
		].join("\n");
		// 欢迎语池：改文案直接改这里——常规 / 金色稀有 / 彩虹传说三档。
		const WELCOME_POOLS = {
			common: ["今天想让我帮你做点什么？", "嗨，有什么想聊的？", "新的一天，想从哪里开始？", "有什么想法，说来听听？", "想让我探索点什么？", "开始吧，告诉我你的目标", "有什么难题，交给我来办", "随便聊聊，或者直接开干？", "需要我做点什么吗？", "我准备好了，随时听候差遣", "想聊什么都可以，我一直都在", "今天想一起解决点什么？", "有什么灵光一现的想法？", "来吧，把你的想法交给我"],
			rare: ["金色传说闪现，你今天运气不错", "恭喜解锁一条金色欢迎语 ✨", "这条金光，只为此刻的你而亮", "稀有掉落：一条自带光环的问候", "我掐指一算，你今天会有好事发生", "运气爆棚！这是一条限量的金色开场"],
			legendary: ["传说级彩蛋！全场唯一的彩虹欢迎语被你抽中了", "万中无一！这条欢迎语自带彩虹，别声张", "天选之人！连欢迎语都在为你发光", "全服通告：你抽中了隐藏的传说欢迎语", "彩虹降临！今天注定是不平凡的一天"],
		};
		function rollWelcome() {
			const roll = Math.random() * 100;
			const tier = roll < 80 ? "common" : roll < 95 ? "rare" : "legendary";
			const pool = WELCOME_POOLS[tier];
			return { text: pool[Math.floor(Math.random() * pool.length)], tier };
		}
		function injectWelcome() {
			let typeTimer = null;
			const startWelcome = () => {
				if (document.querySelector(".dsh-welcome-anchor")) return;
				let span = null;
				const candidates = document.querySelectorAll("span");
				for (let i = 0; i < candidates.length; i++) {
					if (candidates[i].childElementCount === 0 && (candidates[i].textContent || "") === "探索未至之境") { span = candidates[i]; break; }
				}
				if (!span || !span.parentElement) return;
				span.style.display = "none";
				const pick = rollWelcome();
				const wrap = document.createElement("span");
				wrap.className = "dsh-welcome-anchor";
				const line = document.createElement("span");
				line.className = "dsh-welcome" + (pick.tier === "rare" ? " dsh-welcome-rare" : pick.tier === "legendary" ? " dsh-welcome-legendary" : "");
				const caret = document.createElement("span");
				caret.className = "dsh-welcome-caret";
				caret.setAttribute("aria-hidden", "true");
				wrap.appendChild(line);
				wrap.appendChild(caret);
				span.parentElement.insertBefore(wrap, span.nextSibling);
				let shown = 0;
				if (typeTimer) clearInterval(typeTimer);
				typeTimer = setInterval(() => {
					shown += 1;
					line.textContent = pick.text.slice(0, shown);
					if (shown >= pick.text.length) { clearInterval(typeTimer); typeTimer = null; }
				}, 90);
			};
			startWelcome();
			const interval = setInterval(startWelcome, 1200);
			return () => {
				clearInterval(interval);
				if (typeTimer) clearInterval(typeTimer);
				const anchor = document.querySelector(".dsh-welcome-anchor");
				if (anchor) {
					const prev = anchor.previousElementSibling;
					if (prev && prev.style.display === "none") prev.style.display = "";
					anchor.remove();
				}
			};
		}
		function apply(ctx) {
			ctx.effect(() => {
				if (document.getElementById(STYLE_ID) === null) {
					const style = document.createElement("style");
					style.id = STYLE_ID;
					style.textContent = CSS;
					document.head.appendChild(style);
				}
				const disposeWelcome = injectWelcome();
				return () => {
					disposeWelcome();
					document.getElementById(STYLE_ID)?.remove();
				};
			}, "welcome-typewriter: inject");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
