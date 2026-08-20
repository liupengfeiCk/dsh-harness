/**
 * Parse a plan's stored `plan.yml`.
 *
 * A plan is one YAML file carrying its display metadata (name), its pinned
 * route (`provider`/`model`), a bag of `params`, and an optional `default`
 * marker. A plan has no separate plugin tree — the whole asset lives in one
 * file.
 *
 * Every read failure that makes the plan unusable is surfaced as a `broken`
 * reason by discovery; a plan whose file is valid YAML but lacks a usable
 * `provider`/`model` route is broken too (a plan must pin something the merge
 * interceptor can route).
 * @module dsh-harness-model-plan-bundle/metadata
 */
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { PLAN_FILE } from "./discovery.js";
/** A non-empty trimmed string, or undefined for anything else. */
function text(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}
/** A literal boolean, or undefined for anything else. */
function flag(value) {
    return typeof value === 'boolean' ? value : undefined;
}
/** Read a plan's `params` bag as a JSON-safe record, or undefined when unusable. */
function paramsOf(value) {
    if (value === undefined)
        return { params: {} };
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { params: {}, broken: 'the plan "params" must be a map of key=value entries' };
    }
    // Values are carried as-is: they are already restricted to JSON-safe shapes
    // by the authoring surface (which validates them before writing). Reading
    // trusts the stored file the same way a team file's role roster is trusted.
    return { params: value };
}
/**
 * Parse a plan file's contents into its plan shape. Malformed shape is
 * surfaced as a whole-plan `broken` reason.
 * @param id - the plan id (the directory name).
 * @param trust - the trust recorded from the root this plan was found under.
 * @param path - the absolute path of the `plan.yml` file.
 * @param content - the file's raw text.
 * @returns the parsed plan, or a plan carrying a whole-plan `broken` reason.
 */
export function parsePlan(id, trust, path, content) {
    let parsed;
    try {
        parsed = yaml.load(content);
    }
    catch {
        return { id, trust, path, provider: '', model: '', params: {}, isDefault: false, broken: 'the plan file is not valid YAML' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { id, trust, path, provider: '', model: '', params: {}, isDefault: false, broken: 'the plan file must be a YAML map' };
    }
    const record = parsed;
    // A legacy `name` field left by an older plan.yml is ignored: a plan's
    // identity is its id, and the display reads the id.
    const provider = text(record.provider);
    const model = text(record.model);
    const isDefault = flag(record.default) ?? false;
    const paramsParsed = paramsOf(record.params);
    if (provider === undefined || model === undefined) {
        return {
            id, trust, path, provider: '', model: '', params: {}, isDefault,
            broken: 'the plan must pin both a "provider" and a "model"',
        };
    }
    return {
        id,
        provider,
        model,
        params: paramsParsed?.params ?? {},
        trust,
        path,
        isDefault,
        ...paramsParsed?.broken !== undefined ? { broken: paramsParsed.broken } : {},
    };
}
/**
 * Read and parse one plan directory's `plan.yml`.
 * @param directory - the plan directory.
 * @param id - the plan id (the directory name).
 * @param trust - the trust recorded from the root this plan was found under.
 * @returns the parsed plan, or a plan carrying a whole-plan `broken` reason
 *   when the file is missing or unreadable.
 */
export async function readPlan(id, trust, directory) {
    const path = join(directory, PLAN_FILE);
    let content;
    try {
        content = await readFile(path, 'utf8');
    }
    catch {
        return {
            id, trust, path, provider: '', model: '', params: {}, isDefault: false,
            broken: `the plan file ${PLAN_FILE} is missing — the directory still occupies the id; delete it or restore the file`,
        };
    }
    return parsePlan(id, trust, path, content);
}
/**
 * Resolve the single default plan from a discovered roster, by precedence:
 * a user default wins over a system default; within a trust, the plan with the
 * `default: true` marker. When no plan is marked default, no plan is default
 * (a session simply binds nothing unless it explicitly selects a plan).
 * @param plans - the discovered plans (first-root-wins per id).
 * @returns the default plan, or undefined when none is marked default.
 */
export function defaultPlan(plans) {
    const usable = plans.filter(plan => plan.broken === undefined && plan.isDefault);
    if (usable.length === 0)
        return undefined;
    return usable.find(plan => plan.trust === 'user') ?? usable[0];
}
//# sourceMappingURL=metadata.js.map