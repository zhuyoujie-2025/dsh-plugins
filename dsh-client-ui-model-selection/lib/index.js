import z from "@deepseek-ai/schemastery";
//#region lib/types/index.js
/**
* Model selection plugin, node half. Pure UI plugin: the empty apply exists
* so the plugin appears in the host cordis.yml / Loader; the browser half
* ships via exports["./client"], discovered through the package.json
* dsh.client declaration.
*
* The entry does carry one settings-form-facing tunable: `arrangement`
* chooses how the composer picker and the /model popup group the catalog —
* "manufacturer" (original-maker groups, the default), "provider" (one
* group per configured provider, in declared order), or "name" (one flat
* alphabetically sorted list). The field is volatile so a committed edit
* hot-applies to the settings form snapshot without remounting the entry;
* the browser half mirrors it through `configForms`. `order` and
* `groupOrder` carry the settings section's drag ordering — canonical model
* names and rendered group keys — layered over the computed arrangement on
* both selection surfaces; volatile for the same hot-apply reason.
*/
const Config = z.object({
	arrangement: z.union([
		z.const("manufacturer"),
		z.const("provider"),
		z.const("name")
	]).default("manufacturer").volatile(),
	order: z.array(z.string()).default([]).volatile(),
	groupOrder: z.array(z.string()).default([]).volatile()
});
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
//#endregion
export { apply, Config };
