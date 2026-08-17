//#region lib/types/index.js
/**
* dsh-harness-agent-preset-editing-bundle — the Harness-owned agent-preset
* editing capability as a profile bundle. The package's substance is
* `cordis.patch.yml`, declared by the `dsh.bundle.patch` manifest field and
* resolved by the profile composer through that field; the browser surface
* (structured editor over a locally authored preset's editable fields) is
* declared through `dsh.client` and rides the browser half.
* @module dsh-harness-agent-preset-editing-bundle
*/
/** Host plugin body — the editing wire and the browser surface register through the patch rows. */
function apply() {}
//#endregion
export { apply };
