import * as yaml from "js-yaml";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
//#region lib/types/patch.js
/**
* Bundle-patch parsing for the harness hot mount surface.
*
* The hot mounter must know, of an installed plugin's `cordis.patch.yml`, which
* rows it can pull into the running composition. We parse with the SAME
* js-yaml dialect the include plugin itself mounts (`entryListSchema`, the
* `!!js` expression-aware schema from `@deepseek-ai/cordis-plugin-include`), so
* a parsed patch never drifts from what a boot would load — unlike the market's
* hand-written line regex.
*
* Only two row shapes are hot-mountable:
*   - `insert` rows: `{ id, name, config? }` with a STATIC key-value `config`.
*     A `!!js` expression anywhere inside a row's `config` (or `disabled`)
*     evaluates against a loader context that only exists at boot — it cannot
*     be re-evaluated here, so such a patch is refused with "restart required".
*   - `disabled` override rows: `{ id, disabled: <boolean> }`. These target an
*     already-mounted row by id (never restating `name`, matching the loader's
*     patch semantics), so they are hot-applied as-is.
*
* Anything else — nested groups, `inject`/`isolate`/`intercept` keys, non-boolean
* `disabled`, or expressions — is refused rather than half-applied. The caller
* then falls back to restart activation.
* @module dsh-harness-hot-bundle/patch
*/
/** Parse failure: the patch contains a shape that can only activate on restart. */
var RestartRequiredError = class extends Error {
	constructor(reason) {
		super(`bundle patch cannot hot-mount — ${reason}; restart to activate`);
		this.name = "RestartRequiredError";
	}
};
/** Marker of a `!!js` expression parsed by `entryListSchema`. */
function isJsExpr(value) {
	return typeof value === "object" && value !== null && "__jsExpr" in value;
}
/**
* Whether a value contains a `!!js` expression anywhere (recursively through
* plain objects and arrays). The loader evaluates these only at entry
* activation with a live context; the hot mounter cannot.
*/
function containsJsExpr(value) {
	if (isJsExpr(value)) return true;
	if (Array.isArray(value)) return value.some(containsJsExpr);
	if (typeof value === "object" && value !== null) return Object.values(value).some(containsJsExpr);
	return false;
}
/** Whether `value` is a plain static key-value object (no expressions). */
function isStaticConfig(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	return !containsJsExpr(value);
}
/** Require a string field, else throw RestartRequiredError. */
function requireString(value, field) {
	if (typeof value !== "string" || value === "") throw new RestartRequiredError(`row ${field} must be a non-empty string`);
	return value;
}
/** Parse one `insert` list entry into a hot-mountable insert row. */
function parseInsertEntry(entry) {
	if (entry.id === void 0 || entry.name === void 0) throw new RestartRequiredError("an insert row needs both id and name");
	const id = requireString(entry.id, "id");
	const name = requireString(entry.name, "name");
	if (entry.config !== void 0 && !isStaticConfig(entry.config)) throw new RestartRequiredError(`insert row "${id}" carries a config that is not static key-value (a !!js expression or a non-object)`);
	if (entry.disabled !== void 0 && containsJsExpr(entry.disabled)) throw new RestartRequiredError(`insert row "${id}" carries a !!js disabled expression`);
	for (const key of Object.keys(entry)) {
		if (key === "id" || key === "name" || key === "config" || key === "disabled") continue;
		throw new RestartRequiredError(`insert row "${id}" carries unsupported key "${key}"`);
	}
	const row = {
		kind: "insert",
		id,
		name
	};
	if (entry.config !== void 0) row.config = entry.config;
	return row;
}
/** Parse one `disabled` override row into a hot-mountable disable row. */
function parseDisablePatch(patch) {
	if (patch.id === void 0) throw new RestartRequiredError("a disabled override needs an id");
	const id = requireString(patch.id, "id");
	if (patch.disabled === void 0 || containsJsExpr(patch.disabled) || typeof patch.disabled !== "boolean") throw new RestartRequiredError(`disabled override "${id}" must carry a boolean disabled value (no !!js expression)`);
	for (const key of Object.keys(patch)) {
		if (key === "id" || key === "disabled") continue;
		throw new RestartRequiredError(`disabled override "${id}" carries unsupported key "${key}"`);
	}
	return {
		kind: "disable",
		id
	};
}
/**
* Parse a bundle's `cordis.patch.yml` text into hot-mountable rows.
*
* Uses the include plugin's own `entryListSchema`, so the accepted dialect is
* exactly what a boot loads. Rows that cannot hot-mount (expressions, nested
* groups, non-key-value config, structural keys) throw {@link RestartRequiredError}.
* @param patchText - the raw bundle patch text.
* @returns the hot-mountable rows, in patch order.
*/
function parsePatch(patchText) {
	let data;
	try {
		data = yaml.load(patchText, { schema: entryListSchema });
	} catch (error) {
		throw new RestartRequiredError(`patch is not parseable YAML — ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!Array.isArray(data)) throw new RestartRequiredError("patch must be a top-level array");
	if (data.length === 0) throw new RestartRequiredError("patch declares no rows");
	const rows = [];
	for (const element of data) {
		if (element === null || typeof element !== "object" || Array.isArray(element)) throw new RestartRequiredError("a patch element must be an object");
		const patch = element;
		if (patch.insert !== void 0) {
			if (!Array.isArray(patch.insert)) throw new RestartRequiredError("an insert patch must carry an array");
			for (const entry of patch.insert) {
				if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new RestartRequiredError("an insert list entry must be an object");
				rows.push(parseInsertEntry(entry));
			}
			continue;
		}
		rows.push(parseDisablePatch(patch));
	}
	return rows;
}
//#endregion
export { RestartRequiredError, parsePatch };
