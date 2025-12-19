import type { SourceFile, JSDoc } from "ts-morph";

export interface JsDocMetadata {
  summary?: string;
  description?: string;
  tags?: string[];
}

/**
 * Extract JSDoc metadata from a handler export
 * @param sourceFile - The source file containing the handler
 * @param handlerName - Name of the exported handler variable
 * @returns Extracted metadata or null if no JSDoc found
 */
export function extractJsDocFromHandler(
  sourceFile: SourceFile,
  handlerName: string
): JsDocMetadata | null {
  // Find exported variable declaration (e.g., export const putAccountHandlers)
  const exportDecl = sourceFile.getVariableDeclaration(handlerName);
  if (!exportDecl) {
    return null;
  }

  // Get the parent VariableStatement to access JSDoc
  const varStatement = exportDecl.getVariableStatement();
  if (!varStatement) {
    return null;
  }

  // Get JSDoc comments from the VariableStatement
  const jsDocs = varStatement.getJsDocs();
  if (jsDocs.length === 0) {
    return null;
  }

  return parseJsDocTags(jsDocs[0]);
}

/**
 * Parse JSDoc tags into metadata structure
 */
function parseJsDocTags(jsDoc: JSDoc): JsDocMetadata {
  const metadata: JsDocMetadata = {};

  // Extract @summary tag
  const summaryTag = jsDoc.getTags().find((tag) => tag.getTagName() === "summary");
  if (summaryTag) {
    const comment = summaryTag.getComment();
    metadata.summary = typeof comment === "string" ? comment : comment?.map((c) => c.getText()).join("");
  }

  // Extract @description tag
  const descTag = jsDoc.getTags().find((tag) => tag.getTagName() === "description");
  if (descTag) {
    const comment = descTag.getComment();
    metadata.description = typeof comment === "string" ? comment : comment?.map((c) => c.getText()).join("");
  }

  // Extract @tags (comma-separated list)
  const tagsTag = jsDoc.getTags().find((tag) => tag.getTagName() === "tags");
  if (tagsTag) {
    const comment = tagsTag.getComment();
    const tagsStr = typeof comment === "string" ? comment : comment?.map((c) => c.getText()).join("");
    if (tagsStr) {
      metadata.tags = tagsStr.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    }
  }

  return metadata;
}
