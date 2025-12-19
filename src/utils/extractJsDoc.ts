import type { SourceFile, JSDoc, CallExpression } from "ts-morph";

export interface JsDocMetadata {
  summary?: string;
  description?: string;
  tags?: string[];
}

/**
 * Extract JSDoc metadata from an inline handler call expression
 * @param callExpression - The method call expression (e.g., .get())
 * @returns Extracted metadata or null if no JSDoc found
 */
export function extractJsDocFromCallExpression(
  callExpression: CallExpression
): JsDocMetadata | null {
  // Try to get JSDoc from the parent expression statement
  const parent = callExpression.getParent();
  if (parent && typeof (parent as any).getJsDocs === 'function') {
    const jsDocs = (parent as any).getJsDocs();
    if (jsDocs && jsDocs.length > 0) {
      return parseJsDocTags(jsDocs[0]);
    }
  }

  // Fallback: try to parse leading comments manually
  const fullText = callExpression.getFullText();
  const leadingComments = extractLeadingJsDocComment(fullText);
  if (leadingComments) {
    return leadingComments;
  }

  return null;
}

/**
 * Extract JSDoc metadata from leading comment text
 */
function extractLeadingJsDocComment(fullText: string): JsDocMetadata | null {
  // Match the LAST JSDoc comment block (closest to the code): /** ... */
  const jsDocMatches = Array.from(fullText.matchAll(/\/\*\*([\s\S]*?)\*\//g));
  if (jsDocMatches.length === 0) {
    return null;
  }

  // Get the last JSDoc comment (the one immediately before the code)
  const lastMatch = jsDocMatches[jsDocMatches.length - 1];
  const commentContent = lastMatch[1];
  const metadata: JsDocMetadata = {};

  // Split content into lines and process
  const lines = commentContent.split('\n').map(line =>
    line.replace(/^\s*\*?\s*/, '').trim()
  ).filter(line => line.length > 0);

  // Extract description (text before first @tag)
  const descLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('@')) break;
    descLines.push(line);
  }
  if (descLines.length > 0) {
    metadata.description = descLines.join(' ').trim();
  }

  // Extract @summary
  const summaryMatch = commentContent.match(/@summary\s+([^\n@]+)/);
  if (summaryMatch) {
    metadata.summary = summaryMatch[1].trim();
  }

  // Extract @description (overrides default description)
  const descTagMatch = commentContent.match(/@description\s+([^\n@]+)/);
  if (descTagMatch) {
    metadata.description = descTagMatch[1].trim();
  }

  // Extract @tags
  const tagsMatch = commentContent.match(/@tags\s+([^\n]+)/);
  if (tagsMatch) {
    const tagsStr = tagsMatch[1].trim();
    metadata.tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  return metadata;
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

  // Extract description from the main comment text (first line before tags)
  const mainComment = jsDoc.getDescription();
  if (mainComment) {
    // If there's text before the first tag, use it as description
    const descText = mainComment.trim();
    if (descText) {
      metadata.description = descText;
    }
  }

  // Extract @summary tag (takes priority over first line if specified)
  const summaryTag = jsDoc.getTags().find((tag) => tag.getTagName() === "summary");
  if (summaryTag) {
    const comment = summaryTag.getComment();
    metadata.summary = typeof comment === "string" ? comment : comment?.map((c) => c.getText()).join("");
  }

  // Extract @description tag (takes priority over main comment)
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
