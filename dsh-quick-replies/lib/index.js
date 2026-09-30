//#region src/index.js
/**
* dsh-quick-replies — host 半（Node 半）空桩。
*
* 本插件全部逻辑在浏览器半（src/client/）：快捷语 chip 条 + 设置页，
* 数据持久化走浏览器 localStorage，不注册任何 host 配置与服务。
*/
const name = "dsh-quick-replies";
const inject = [];
function apply() {}
//#endregion
export { apply, inject, name };
