export async function writeGenerationProvenanceBestEffort(params) {
    const { layer, logger, writeLog, writeRefs } = params;
    try {
        await writeLog();
    }
    catch (error) {
        logger?.warn?.(`[memory-generation-log] ${layer} log write failed; memory generation remains successful: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    if (!writeRefs)
        return;
    try {
        await writeRefs();
    }
    catch (error) {
        logger?.warn?.(`[memory-generation-log] ${layer} reference write failed; memory generation remains successful: ${error instanceof Error ? error.message : String(error)}`);
    }
}
