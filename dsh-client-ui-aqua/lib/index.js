//#region src/index.js
/**
* dsh-client-ui-aqua — host half.
*
* 浏览器半拥有全部 UI（「设置 → 通用」里的 Aqua 开关 + 主题 token 覆盖）。
* 这里无需注册任何命令/服务/会话钩子，但 bundle 清单要求 lib/index.js 存在，
* 故此文件是一个最小 apply() 桩。
*/
function apply() {}
//#endregion
export { apply };
